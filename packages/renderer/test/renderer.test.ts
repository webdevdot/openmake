import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import type { CanvasKit } from 'canvaskit-wasm';
import { OpenDoc } from '@openmake/core';
import { buildRenderScene } from '../src/scene.js';
import { createCanvasKitRenderer, type TestableRenderer } from '../src/renderer.js';
import { clearRegisteredFonts, registerFont } from '../src/fonts.js';
import { getCanvasKit, readPixel, expectRGBA } from './setup.js';

let ck: CanvasKit;

beforeAll(async () => {
  ck = await getCanvasKit();
});

function newDocWithPage() {
  const doc = OpenDoc.create({ name: 'Render test' });
  const pageId = doc.getPages()[0]!;
  doc.updateNode(pageId, { backgroundColor: { r: 1, g: 1, b: 1, a: 1 } });
  return { doc, pageId };
}

async function makeRenderer(): Promise<TestableRenderer> {
  return (await createCanvasKitRenderer({}, { canvasKit: ck })) as TestableRenderer;
}

describe('CanvasKitRenderer.render', () => {
  it('draws a solid red rect at the expected pixel and background elsewhere', async () => {
    const { doc, pageId } = newDocWithPage();
    doc.createNode({
      type: 'RECTANGLE',
      parentId: pageId,
      x: 10,
      y: 10,
      width: 50,
      height: 50,
      fills: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0, a: 1 }, opacity: 1, visible: true }],
    });
    const scene = buildRenderScene(doc, pageId);
    const renderer = await makeRenderer();
    renderer.render(scene, { x: 0, y: 0, zoom: 1 });

    expectRGBA(readPixel(ck, renderer.getSurface(), 20, 20), { r: 255, g: 0, b: 0, a: 255 });
    expectRGBA(readPixel(ck, renderer.getSurface(), 5, 5), { r: 255, g: 255, b: 255, a: 255 });
  });

  it('respects z-order: the topmost rect wins at overlap', async () => {
    const { doc, pageId } = newDocWithPage();
    doc.createNode({
      type: 'RECTANGLE',
      parentId: pageId,
      x: 0,
      y: 0,
      width: 50,
      height: 50,
      fills: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0, a: 1 }, opacity: 1, visible: true }],
    });
    doc.createNode({
      type: 'RECTANGLE',
      parentId: pageId,
      x: 20,
      y: 20,
      width: 50,
      height: 50,
      fills: [{ type: 'SOLID', color: { r: 0, g: 0, b: 1, a: 1 }, opacity: 1, visible: true }],
    });
    const scene = buildRenderScene(doc, pageId);
    const renderer = await makeRenderer();
    renderer.render(scene, { x: 0, y: 0, zoom: 1 });

    // Overlap region: the later (topmost) blue rect should win.
    expectRGBA(readPixel(ck, renderer.getSurface(), 30, 30), { r: 0, g: 0, b: 255, a: 255 });
    // Non-overlap region of the bottom red rect.
    expectRGBA(readPixel(ck, renderer.getSurface(), 5, 5), { r: 255, g: 0, b: 0, a: 255 });
  });

  it('blends opacity 0.5 over the white background', async () => {
    const { doc, pageId } = newDocWithPage();
    doc.createNode({
      type: 'RECTANGLE',
      parentId: pageId,
      x: 0,
      y: 0,
      width: 50,
      height: 50,
      opacity: 0.5,
      fills: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0, a: 1 }, opacity: 1, visible: true }],
    });
    const scene = buildRenderScene(doc, pageId);
    const renderer = await makeRenderer();
    renderer.render(scene, { x: 0, y: 0, zoom: 1 });

    // 0.5 * red(255,0,0) + 0.5 * white(255,255,255) = (255, 127, 127)
    expectRGBA(readPixel(ck, renderer.getSurface(), 10, 10), { r: 255, g: 127, b: 127, a: 255 }, 4);
  });

  it('clips out-of-bounds children when the frame clipsContent', async () => {
    const { doc, pageId } = newDocWithPage();
    const frameId = doc.createNode({
      type: 'FRAME',
      parentId: pageId,
      x: 0,
      y: 0,
      width: 30,
      height: 30,
      clipsContent: true,
      fills: [],
    });
    doc.createNode({
      type: 'RECTANGLE',
      parentId: frameId,
      x: 20,
      y: 20,
      width: 40,
      height: 40,
      fills: [{ type: 'SOLID', color: { r: 0, g: 1, b: 0, a: 1 }, opacity: 1, visible: true }],
    });
    const scene = buildRenderScene(doc, pageId);
    const renderer = await makeRenderer();
    renderer.render(scene, { x: 0, y: 0, zoom: 1 });

    // Inside the frame and the child rect: green.
    expectRGBA(readPixel(ck, renderer.getSurface(), 25, 25), { r: 0, g: 255, b: 0, a: 255 });
    // Outside the 30x30 frame bounds but where the (unclipped) child would have drawn: background.
    expectRGBA(readPixel(ck, renderer.getSurface(), 45, 45), { r: 255, g: 255, b: 255, a: 255 });
  });

  it('renders an ellipse with background at corners and fill at center', async () => {
    const { doc, pageId } = newDocWithPage();
    doc.createNode({
      type: 'ELLIPSE',
      parentId: pageId,
      x: 0,
      y: 0,
      width: 40,
      height: 40,
      fills: [{ type: 'SOLID', color: { r: 0, g: 0, b: 1, a: 1 }, opacity: 1, visible: true }],
    });
    const scene = buildRenderScene(doc, pageId);
    const renderer = await makeRenderer();
    renderer.render(scene, { x: 0, y: 0, zoom: 1 });

    expectRGBA(readPixel(ck, renderer.getSurface(), 20, 20), { r: 0, g: 0, b: 255, a: 255 });
    expectRGBA(readPixel(ck, renderer.getSurface(), 1, 1), { r: 255, g: 255, b: 255, a: 255 });
  });

  it('approximates a linear gradient at its endpoints', async () => {
    const { doc, pageId } = newDocWithPage();
    doc.createNode({
      type: 'RECTANGLE',
      parentId: pageId,
      x: 0,
      y: 0,
      width: 100,
      height: 10,
      fills: [
        {
          type: 'GRADIENT_LINEAR',
          from: { x: 0, y: 0 },
          to: { x: 1, y: 0 },
          stops: [
            { position: 0, color: { r: 1, g: 0, b: 0, a: 1 } },
            { position: 1, color: { r: 0, g: 0, b: 1, a: 1 } },
          ],
          opacity: 1,
          visible: true,
        },
      ],
    });
    const scene = buildRenderScene(doc, pageId);
    const renderer = await makeRenderer();
    renderer.render(scene, { x: 0, y: 0, zoom: 1 });

    const start = readPixel(ck, renderer.getSurface(), 1, 5);
    const end = readPixel(ck, renderer.getSurface(), 98, 5);
    expect(start.r).toBeGreaterThan(200);
    expect(start.b).toBeLessThan(60);
    expect(end.b).toBeGreaterThan(200);
    expect(end.r).toBeLessThan(60);
  });

  it('rotating a tall rect 90 degrees makes it appear wide', async () => {
    const { doc, pageId } = newDocWithPage();
    // A tall, narrow rect centered at (50, 50) with size 10x60.
    doc.createNode({
      type: 'RECTANGLE',
      parentId: pageId,
      x: 45,
      y: 20,
      width: 10,
      height: 60,
      rotation: 90,
      fills: [{ type: 'SOLID', color: { r: 1, g: 0.5, b: 0, a: 1 }, opacity: 1, visible: true }],
    });
    const scene = buildRenderScene(doc, pageId);
    const renderer = await makeRenderer();
    renderer.render(scene, { x: 0, y: 0, zoom: 1 });

    // After a 90deg rotation about its own center, the rect (originally 10 wide x 60 tall,
    // centered at 50,50) becomes 60 wide x 10 tall — so a point far to the side (20,50)
    // should now be filled, whereas before rotation it would have been background.
    expectRGBA(readPixel(ck, renderer.getSurface(), 20, 50), { r: 255, g: 127, b: 0, a: 255 }, 4);
  });

  it('camera zoom 2 doubles the apparent size of a shape', async () => {
    const { doc, pageId } = newDocWithPage();
    doc.createNode({
      type: 'RECTANGLE',
      parentId: pageId,
      x: 10,
      y: 10,
      width: 20,
      height: 20,
      fills: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0, a: 1 }, opacity: 1, visible: true }],
    });
    const scene = buildRenderScene(doc, pageId);
    const renderer = await makeRenderer();
    renderer.render(scene, { x: 0, y: 0, zoom: 2 });

    // Without zoom, (35, 35) would be outside the 10..30 rect; with zoom 2 the rect
    // occupies screen pixels 20..60, so (35, 35) should now be filled.
    expectRGBA(readPixel(ck, renderer.getSurface(), 35, 35), { r: 255, g: 0, b: 0, a: 255 });
  });

  it('draws a registered-font TEXT node without throwing on the ParagraphStyle marshaller', async () => {
    // Regression: a bare ParagraphStyle object literal makes CanvasKit's
    // emscripten binding throw `Missing field: "disableHinting"` inside
    // MakeFromFontProvider, which killed the whole render loop for any
    // document containing text. drawText early-returns for unregistered
    // fonts, so text is only exercised once a real font is registered —
    // register Inter (the app default) here to hit the actual path.
    const interBytes = new Uint8Array(
      readFileSync(
        fileURLToPath(
          new URL('../../../apps/editor/src/assets/fonts/Inter-Regular.ttf', import.meta.url),
        ),
      ),
    );
    registerFont(interBytes, 'Inter');
    try {
      const { doc, pageId } = newDocWithPage();
      doc.createNode({
        type: 'TEXT',
        parentId: pageId,
        x: 5,
        y: 5,
        width: 200,
        height: 40,
        characters: 'Hello',
        textStyle: {
          fontFamily: 'Inter',
          fontSize: 32,
          fontWeight: 400,
          fontStyle: 'NORMAL',
          lineHeight: 'AUTO',
          letterSpacing: 0,
          textAlign: 'LEFT',
          textDecoration: 'NONE',
        },
        fills: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0, a: 1 }, opacity: 1, visible: true }],
      });
      const scene = buildRenderScene(doc, pageId);
      const renderer = await makeRenderer();
      // The assertion is that this does not throw; also confirm ink landed by
      // scanning the glyph band for at least one non-background (dark) pixel.
      expect(() => renderer.render(scene, { x: 0, y: 0, zoom: 1 })).not.toThrow();
      let inked = false;
      for (let x = 5; x < 120 && !inked; x += 1) {
        for (let y = 5; y < 45 && !inked; y += 1) {
          if (readPixel(ck, renderer.getSurface(), x, y).r < 128) inked = true;
        }
      }
      expect(inked).toBe(true);
    } finally {
      clearRegisteredFonts();
    }
  });
});

describe('CanvasKitRenderer.exportPNG', () => {
  it('returns valid PNG bytes with the expected dimensions', async () => {
    const { doc, pageId } = newDocWithPage();
    doc.createNode({
      type: 'RECTANGLE',
      parentId: pageId,
      x: 0,
      y: 0,
      width: 64,
      height: 32,
      fills: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0, a: 1 }, opacity: 1, visible: true }],
    });
    const scene = buildRenderScene(doc, pageId);
    const renderer = await makeRenderer();
    const bytes = await renderer.exportPNG(scene);

    expect(Array.from(bytes.subarray(0, 8))).toEqual([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);

    // IHDR chunk: 4 (length) + 4 ('IHDR') + width(4) + height(4), big-endian, starting at byte 8.
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const width = view.getUint32(16);
    const height = view.getUint32(20);
    expect(width).toBe(64);
    expect(height).toBe(32);
  });

  it('exports a single node scaled to its own bounds', async () => {
    const { doc, pageId } = newDocWithPage();
    const rectId = doc.createNode({
      type: 'RECTANGLE',
      parentId: pageId,
      x: 100,
      y: 100,
      width: 20,
      height: 10,
      fills: [{ type: 'SOLID', color: { r: 0, g: 1, b: 0, a: 1 }, opacity: 1, visible: true }],
    });
    const scene = buildRenderScene(doc, pageId);
    const renderer = await makeRenderer();
    const bytes = await renderer.exportPNG(scene, { nodeId: rectId, scale: 2 });

    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    expect(view.getUint32(16)).toBe(40);
    expect(view.getUint32(20)).toBe(20);
  });
});

describe('buildRenderScene', () => {
  it('expands an instance into synthetic nodes and excludes invisible nodes', () => {
    const doc = OpenDoc.create();
    const pageId = doc.getPages()[0]!;
    const componentFrameId = doc.createNode({
      type: 'FRAME',
      parentId: pageId,
      width: 40,
      height: 40,
    });
    const visibleChildId = doc.createNode({
      type: 'RECTANGLE',
      parentId: componentFrameId,
      width: 10,
      height: 10,
    });
    const invisibleChildId = doc.createNode({
      type: 'RECTANGLE',
      parentId: componentFrameId,
      width: 10,
      height: 10,
      visible: false,
    });
    doc.createComponentFromNode(componentFrameId);
    // Component masters are typically hidden on the canvas; hide it so the scene
    // only contains the instance's expansion, isolating this test's assertion.
    doc.updateNode(componentFrameId, { visible: false });
    const instanceId = doc.createInstance(componentFrameId, pageId, { x: 5, y: 5 });

    const scene = buildRenderScene(doc, pageId);

    expect(scene.rootIds).toEqual([`${instanceId}:${componentFrameId}`]);
    expect(scene.nodes[`${instanceId}:${componentFrameId}`]).toBeDefined();
    expect(scene.nodes[`${instanceId}:${visibleChildId}`]).toBeDefined();
    expect(scene.nodes[`${instanceId}:${invisibleChildId}`]).toBeUndefined();
  });

  it('excludes an invisible top-level node from the scene', () => {
    const doc = OpenDoc.create();
    const pageId = doc.getPages()[0]!;
    doc.createNode({ type: 'RECTANGLE', parentId: pageId, width: 10, height: 10, visible: false });
    const visibleId = doc.createNode({
      type: 'RECTANGLE',
      parentId: pageId,
      width: 10,
      height: 10,
    });

    const scene = buildRenderScene(doc, pageId);

    expect(scene.rootIds).toEqual([visibleId]);
  });
});
