import { describe, expect, it } from 'vitest';
import { OpenDoc } from '@openmake/core';
import { buildRenderScene } from '../src/scene.js';
import { exportSVG } from '../src/svg.js';

function newDocWithPage() {
  const doc = OpenDoc.create({ name: 'SVG test' });
  const pageId = doc.getPages()[0]!;
  return { doc, pageId };
}

describe('exportSVG', () => {
  it('serializes a solid rect with fill and transform attributes', () => {
    const { doc, pageId } = newDocWithPage();
    doc.createNode({
      type: 'RECTANGLE',
      parentId: pageId,
      x: 10,
      y: 20,
      width: 30,
      height: 40,
      cornerRadius: 4,
      fills: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0, a: 1 }, opacity: 1, visible: true }],
    });
    const scene = buildRenderScene(doc, pageId);
    const svg = exportSVG(scene);

    expect(svg).toContain('<svg');
    expect(svg).toContain('<rect');
    expect(svg).toContain('rx="4"');
    expect(svg).toContain('fill="rgb(255,0,0)"');
    expect(svg).toContain('transform="matrix(1 0 0 1 10 20)"');
  });

  it('serializes an ellipse as an <ellipse> element', () => {
    const { doc, pageId } = newDocWithPage();
    doc.createNode({
      type: 'ELLIPSE',
      parentId: pageId,
      x: 0,
      y: 0,
      width: 20,
      height: 10,
      fills: [{ type: 'SOLID', color: { r: 0, g: 0, b: 1, a: 1 }, opacity: 1, visible: true }],
    });
    const scene = buildRenderScene(doc, pageId);
    const svg = exportSVG(scene);

    expect(svg).toContain('<ellipse');
    expect(svg).toContain('rx="10"');
    expect(svg).toContain('ry="5"');
  });

  it('serializes a vector node path as a <path> with the node d attribute', () => {
    const { doc, pageId } = newDocWithPage();
    doc.createNode({
      type: 'VECTOR',
      parentId: pageId,
      width: 10,
      height: 10,
      path: 'M0,0 L10,10',
      fills: [{ type: 'SOLID', color: { r: 0, g: 1, b: 0, a: 1 }, opacity: 1, visible: true }],
    });
    const scene = buildRenderScene(doc, pageId);
    const svg = exportSVG(scene);

    expect(svg).toContain('<path');
    expect(svg).toContain('d="M0,0 L10,10"');
  });

  it('serializes a polygon as a path with an M/L/Z point sequence', () => {
    const { doc, pageId } = newDocWithPage();
    doc.createNode({
      type: 'POLYGON',
      parentId: pageId,
      width: 10,
      height: 10,
      pointCount: 3,
      fills: [{ type: 'SOLID', color: { r: 0, g: 1, b: 0, a: 1 }, opacity: 1, visible: true }],
    });
    const scene = buildRenderScene(doc, pageId);
    const svg = exportSVG(scene);

    expect(svg).toMatch(/<path d="M[\d.-]+,[\d.-]+ L[\d.-]+,[\d.-]+ L[\d.-]+,[\d.-]+ Z"/);
  });

  it('serializes a text node as a <text> element with its characters', () => {
    const { doc, pageId } = newDocWithPage();
    doc.createNode({
      type: 'TEXT',
      parentId: pageId,
      width: 100,
      height: 20,
      characters: 'Hello',
      fills: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0, a: 1 }, opacity: 1, visible: true }],
    });
    const scene = buildRenderScene(doc, pageId);
    const svg = exportSVG(scene);

    expect(svg).toContain('<text');
    expect(svg).toContain('>Hello</text>');
  });

  it('includes opacity and stroke attributes', () => {
    const { doc, pageId } = newDocWithPage();
    doc.createNode({
      type: 'RECTANGLE',
      parentId: pageId,
      width: 10,
      height: 10,
      opacity: 0.5,
      fills: [],
      strokes: [
        {
          paint: { type: 'SOLID', color: { r: 0, g: 0, b: 0, a: 1 }, opacity: 1, visible: true },
          weight: 2,
          align: 'CENTER',
        },
      ],
    });
    const scene = buildRenderScene(doc, pageId);
    const svg = exportSVG(scene);

    expect(svg).toContain('opacity="0.5"');
    expect(svg).toContain('stroke="rgb(0,0,0)"');
    expect(svg).toContain('stroke-width="2"');
  });

  it('restricts output to a single node when nodeId is given', () => {
    const { doc, pageId } = newDocWithPage();
    doc.createNode({ type: 'RECTANGLE', parentId: pageId, width: 10, height: 10, fills: [] });
    const nodeId = doc.createNode({
      type: 'ELLIPSE',
      parentId: pageId,
      width: 20,
      height: 20,
      fills: [{ type: 'SOLID', color: { r: 1, g: 1, b: 0, a: 1 }, opacity: 1, visible: true }],
    });
    const scene = buildRenderScene(doc, pageId);
    const svg = exportSVG(scene, { nodeId });

    expect(svg).toContain('<ellipse');
    expect(svg).not.toContain('<rect');
  });
});
