import type {
  CanvasKit,
  Canvas as SkCanvas,
  Paint as SkPaint,
  Path as SkPath,
  Surface,
  TextAlign as SkTextAlign,
} from 'canvaskit-wasm';
import type { SceneNode } from '@openmake/shared';
import { nodeLocalMatrix, type Mat2x3 } from '@openmake/core';
import { loadCanvasKit } from './canvaskit.js';
import type { Camera, RenderScene } from './scene.js';
import { ellipsePath, polygonPath, starPath } from './geometry.js';
import { applyEffects, blendModeToSk, paintToSkPaint, strokeToSkPaint } from './paint.js';
import { getFontProvider, isFontRegistered } from './fonts.js';

export interface Renderer {
  render(scene: RenderScene, camera: Camera): void;
  resize(width: number, height: number, dpr?: number): void;
  exportPNG(scene: RenderScene, opts?: { nodeId?: string; scale?: number }): Promise<Uint8Array>;
  dispose(): void;
}

export interface RenderTarget {
  surface?: 'offscreen';
  canvas?: HTMLCanvasElement;
}

export interface CreateRendererOpts {
  canvasKit?: CanvasKit;
}

/** Converts our row-major 2x3 affine matrix to CanvasKit's row-major 3x3 form. */
function toSkMatrix(m: Mat2x3): number[] {
  return [m[0], m[2], m[4], m[1], m[3], m[5], 0, 0, 1];
}

/** Test-only extension surfacing the backing CanvasKit Surface for pixel assertions. */
export interface TestableRenderer extends Renderer {
  getSurface(): Surface;
}

class CanvasKitRenderer implements TestableRenderer {
  private width = 0;
  private height = 0;
  private dpr = 1;

  constructor(
    private readonly ck: CanvasKit,
    private surface: Surface,
    private readonly isOffscreen: boolean,
    private readonly canvasEl?: HTMLCanvasElement,
  ) {
    this.width = surface.width();
    this.height = surface.height();
  }

  /** @internal exposed for tests that need to read raw pixels off the raster surface */
  getSurface(): Surface {
    return this.surface;
  }

  render(scene: RenderScene, camera: Camera): void {
    const canvas = this.surface.getCanvas();
    canvas.save();
    canvas.clear(
      scene.backgroundColor
        ? this.ck.Color4f(
            scene.backgroundColor.r,
            scene.backgroundColor.g,
            scene.backgroundColor.b,
            scene.backgroundColor.a,
          )
        : this.ck.Color4f(1, 1, 1, 1),
    );
    canvas.scale(this.dpr, this.dpr);
    canvas.scale(camera.zoom, camera.zoom);
    canvas.translate(-camera.x, -camera.y);

    for (const rootId of scene.rootIds) {
      this.drawNode(canvas, scene, rootId);
    }

    canvas.restore();
    this.surface.flush();
  }

  private drawNode(canvas: SkCanvas, scene: RenderScene, nodeId: string): void {
    const node = scene.nodes[nodeId];
    if (!node || !node.visible) return;

    const ck = this.ck;
    canvas.save();
    canvas.concat(toSkMatrix(nodeLocalMatrix(node)));

    const needsLayer = node.opacity < 1 || node.blendMode !== 'NORMAL';
    let layerPaint: SkPaint | undefined;
    if (needsLayer) {
      layerPaint = new ck.Paint();
      layerPaint.setAlphaf(node.opacity);
      layerPaint.setBlendMode(blendModeToSk(ck, node.blendMode));
      canvas.saveLayer(layerPaint, null, null);
    }

    const isContainer = 'children' in node;
    const clips = isContainer && (node as { clipsContent?: boolean }).clipsContent;
    if (clips) {
      const rrect = ck.RRectXY(
        ck.LTRBRect(0, 0, node.width, node.height),
        containerCornerRadius(node),
        containerCornerRadius(node),
      );
      canvas.clipRRect(rrect, ck.ClipOp.Intersect, true);
    }

    this.drawOwnGeometry(canvas, node, scene);

    if (isContainer) {
      const children = (node as { children: string[] }).children;
      for (const childId of children) this.drawNode(canvas, scene, childId);
    }

    if (needsLayer) {
      canvas.restore();
      layerPaint?.delete();
    }
    canvas.restore();
  }

  private drawOwnGeometry(canvas: SkCanvas, node: SceneNode, scene: RenderScene): void {
    const ck = this.ck;
    const getImageBytes = (assetId: string) => scene.images?.[assetId];

    switch (node.type) {
      case 'DOCUMENT':
      case 'PAGE':
      case 'GROUP':
      case 'COMPONENT_SET':
        return;
      case 'RECTANGLE':
      case 'FRAME':
      case 'COMPONENT':
      case 'INSTANCE': {
        const cornerRadius = 'cornerRadius' in node ? (node.cornerRadius ?? 0) : 0;
        const rrect = ck.RRectXY(
          ck.LTRBRect(0, 0, node.width, node.height),
          cornerRadius,
          cornerRadius,
        );
        for (const paint of node.fills ?? []) {
          const skPaint = paintToSkPaint(ck, paint, node.width, node.height, getImageBytes);
          if (!skPaint) continue;
          applyEffects(ck, skPaint, node.effects ?? []);
          canvas.drawRRect(rrect, skPaint);
          skPaint.delete();
        }
        this.drawStrokes(canvas, node, rrect);
        return;
      }
      case 'ELLIPSE': {
        const path = ellipsePath(ck, node);
        for (const paint of node.fills ?? []) {
          const skPaint = paintToSkPaint(ck, paint, node.width, node.height, getImageBytes);
          if (!skPaint) continue;
          applyEffects(ck, skPaint, node.effects ?? []);
          canvas.drawPath(path, skPaint);
          skPaint.delete();
        }
        this.drawStrokesPath(canvas, node, path);
        path.delete();
        return;
      }
      case 'POLYGON':
      case 'STAR': {
        const path = node.type === 'POLYGON' ? polygonPath(ck, node) : starPath(ck, node);
        for (const paint of node.fills ?? []) {
          const skPaint = paintToSkPaint(ck, paint, node.width, node.height, getImageBytes);
          if (!skPaint) continue;
          applyEffects(ck, skPaint, node.effects ?? []);
          canvas.drawPath(path, skPaint);
          skPaint.delete();
        }
        this.drawStrokesPath(canvas, node, path);
        path.delete();
        return;
      }
      case 'LINE': {
        for (const stroke of node.strokes ?? []) {
          const skPaint = strokeToSkPaint(ck, stroke, node.width, node.height, getImageBytes);
          if (!skPaint) continue;
          canvas.drawLine(0, 0, node.width, 0, skPaint);
          skPaint.delete();
        }
        return;
      }
      case 'VECTOR': {
        const path = ck.Path.MakeFromSVGString(node.path);
        if (!path) return;
        for (const paint of node.fills ?? []) {
          const skPaint = paintToSkPaint(ck, paint, node.width, node.height, getImageBytes);
          if (!skPaint) continue;
          applyEffects(ck, skPaint, node.effects ?? []);
          canvas.drawPath(path, skPaint);
          skPaint.delete();
        }
        this.drawStrokesPath(canvas, node, path);
        path.delete();
        return;
      }
      case 'TEXT': {
        this.drawText(canvas, node);
        return;
      }
    }
  }

  private drawStrokes(canvas: SkCanvas, node: StrokableNode, rrect: Float32Array): void {
    const ck = this.ck;
    const noImages = () => undefined;
    for (const stroke of node.strokes ?? []) {
      const skPaint = strokeToSkPaint(ck, stroke, node.width, node.height, noImages);
      if (!skPaint) continue;
      canvas.drawRRect(rrect, skPaint);
      skPaint.delete();
    }
  }

  private drawStrokesPath(canvas: SkCanvas, node: StrokableNode, path: SkPath): void {
    const ck = this.ck;
    const noImages = () => undefined;
    for (const stroke of node.strokes ?? []) {
      const skPaint = strokeToSkPaint(ck, stroke, node.width, node.height, noImages);
      if (!skPaint) continue;
      canvas.drawPath(path, skPaint);
      skPaint.delete();
    }
  }

  private drawText(canvas: SkCanvas, node: Extract<SceneNode, { type: 'TEXT' }>): void {
    const ck = this.ck;
    const family = node.textStyle.fontFamily;
    if (!isFontRegistered(family)) return; // Silently skip unregistered fonts.

    const fontProvider = getFontProvider(ck);
    const fill = node.fills?.find((p) => p.visible && p.type === 'SOLID');
    const color =
      fill && fill.type === 'SOLID'
        ? ck.Color4f(fill.color.r, fill.color.g, fill.color.b, fill.color.a * fill.opacity)
        : ck.Color4f(0, 0, 0, 1);

    const lineHeight = node.textStyle.lineHeight === 'AUTO' ? 1.2 : node.textStyle.lineHeight;

    // Must go through the ParagraphStyle constructor, not a bare object
    // literal: it fills in the optional struct fields (disableHinting,
    // strutStyle, …) that CanvasKit's emscripten toWireType marshaller
    // requires — a plain literal throws `Missing field: "disableHinting"`
    // and takes down the whole render loop.
    const paragraphStyle = new ck.ParagraphStyle({
      textAlign: textAlignToSk(ck, node.textStyle.textAlign),
      textStyle: {
        color,
        fontFamilies: [family],
        fontSize: node.textStyle.fontSize,
        heightMultiplier: lineHeight,
        letterSpacing: node.textStyle.letterSpacing,
      },
    });

    const builder = ck.ParagraphBuilder.MakeFromFontProvider(paragraphStyle, fontProvider);
    builder.addText(node.characters);
    const paragraph = builder.build();
    paragraph.layout(node.width);
    canvas.drawParagraph(paragraph, 0, 0);
    paragraph.delete();
    builder.delete();
  }

  resize(width: number, height: number, dpr = 1): void {
    this.width = width;
    this.height = height;
    this.dpr = dpr;
    if (!this.isOffscreen && this.canvasEl) {
      // Assigning canvas.width/height resets the WebGL drawing buffer and
      // orphans the previous Surface — the renderer must own recreation.
      this.canvasEl.width = Math.max(1, Math.round(width * dpr));
      this.canvasEl.height = Math.max(1, Math.round(height * dpr));
      this.surface.delete();
      this.surface =
        this.ck.MakeWebGLCanvasSurface(this.canvasEl, undefined, { preserveDrawingBuffer: 1 }) ??
        this.ck.MakeSurface(this.canvasEl.width, this.canvasEl.height) ??
        (() => {
          throw new Error('Failed to recreate CanvasKit surface on resize');
        })();
    }
  }

  async exportPNG(
    scene: RenderScene,
    opts: { nodeId?: string; scale?: number } = {},
  ): Promise<Uint8Array> {
    const ck = this.ck;
    const scale = opts.scale ?? 1;
    const bounds = opts.nodeId ? nodeExportBounds(scene, opts.nodeId) : sceneExportBounds(scene);

    const width = Math.max(1, Math.round(bounds.width * scale));
    const height = Math.max(1, Math.round(bounds.height * scale));
    const exportSurface = ck.MakeSurface(width, height);
    if (!exportSurface) throw new Error('Failed to create CanvasKit export surface');

    const canvas = exportSurface.getCanvas();
    // Only paint the page background for a whole-scene export; a single-node
    // export is a transparent crop of just that node's own drawing.
    canvas.clear(
      !opts.nodeId && scene.backgroundColor
        ? ck.Color4f(
            scene.backgroundColor.r,
            scene.backgroundColor.g,
            scene.backgroundColor.b,
            scene.backgroundColor.a,
          )
        : ck.Color4f(0, 0, 0, 0),
    );
    canvas.save();
    canvas.scale(scale, scale);
    canvas.translate(-bounds.x, -bounds.y);

    if (opts.nodeId) {
      this.drawNode(canvas, scene, opts.nodeId);
    } else {
      for (const rootId of scene.rootIds) this.drawNode(canvas, scene, rootId);
    }
    canvas.restore();
    exportSurface.flush();

    const image = exportSurface.makeImageSnapshot();
    const bytes = image.encodeToBytes();
    image.delete();
    exportSurface.dispose();
    if (!bytes) throw new Error('Failed to encode PNG');
    return bytes;
  }

  dispose(): void {
    this.surface.dispose();
  }
}

type StrokableNode = Extract<SceneNode, { strokes: unknown[] }>;

function containerCornerRadius(node: SceneNode): number {
  return 'cornerRadius' in node ? ((node as { cornerRadius?: number }).cornerRadius ?? 0) : 0;
}

function textAlignToSk(ck: CanvasKit, align: 'LEFT' | 'CENTER' | 'RIGHT' | 'JUSTIFY'): SkTextAlign {
  const map: Record<string, SkTextAlign> = {
    LEFT: ck.TextAlign.Left,
    CENTER: ck.TextAlign.Center,
    RIGHT: ck.TextAlign.Right,
    JUSTIFY: ck.TextAlign.Justify,
  };
  return map[align] ?? ck.TextAlign.Left;
}

interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

function nodeExportBounds(scene: RenderScene, nodeId: string): Bounds {
  const node = scene.nodes[nodeId];
  if (!node) throw new Error(`Node "${nodeId}" not found in scene`);
  return { x: 0, y: 0, width: node.width, height: node.height };
}

function sceneExportBounds(scene: RenderScene): Bounds {
  let maxX = 0;
  let maxY = 0;
  for (const id of scene.rootIds) {
    const node = scene.nodes[id];
    if (!node) continue;
    maxX = Math.max(maxX, node.x + node.width);
    maxY = Math.max(maxY, node.y + node.height);
  }
  return { x: 0, y: 0, width: maxX || 1, height: maxY || 1 };
}

/**
 * Creates a CanvasKit-backed Renderer. In Node (or when `target.surface ===
 * 'offscreen'`), a raster surface is used, which is what powers exportPNG and
 * the test suite. In the browser, pass a `target.canvas` to get a
 * WebGL-backed surface with a raster fallback.
 */
export async function createCanvasKitRenderer(
  target: RenderTarget,
  opts: CreateRendererOpts = {},
): Promise<Renderer> {
  const ck = opts.canvasKit ?? (await loadCanvasKit());

  let surface: Surface | null;
  let isOffscreen: boolean;
  if (target.canvas) {
    // preserveDrawingBuffer keeps the framebuffer readable after compositing —
    // required for reliable canvas screenshots/readbacks (exports, E2E checks).
    surface =
      ck.MakeWebGLCanvasSurface(target.canvas, undefined, { preserveDrawingBuffer: 1 }) ??
      ck.MakeSurface(target.canvas.width, target.canvas.height);
    isOffscreen = false;
  } else {
    const width = 800;
    const height = 600;
    surface = ck.MakeSurface(width, height);
    isOffscreen = true;
  }
  if (!surface) throw new Error('Failed to create CanvasKit surface');

  return new CanvasKitRenderer(ck, surface, isOffscreen, target.canvas);
}
