import type { CanvasKit, Canvas as SkCanvas, Surface } from 'canvaskit-wasm';
import { loadCanvasKit } from '../src/canvaskit.js';

let canvasKitPromise: Promise<CanvasKit> | undefined;

/** Loaded once per test process; CanvasKit WASM init is heavy. */
export function getCanvasKit(): Promise<CanvasKit> {
  if (!canvasKitPromise) canvasKitPromise = loadCanvasKit();
  return canvasKitPromise;
}

export interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** Reads a single pixel from a raster surface as 0-255 RGBA. */
export function readPixel(ck: CanvasKit, surface: Surface, x: number, y: number): RGBA {
  const canvas: SkCanvas = surface.getCanvas();
  const imageInfo = {
    width: 1,
    height: 1,
    colorType: ck.ColorType.RGBA_8888,
    alphaType: ck.AlphaType.Unpremul,
    colorSpace: ck.ColorSpace.SRGB,
  };
  const pixels = canvas.readPixels(x, y, imageInfo) as Uint8Array | null;
  if (!pixels) throw new Error(`readPixels failed at (${x}, ${y})`);
  return { r: pixels[0]!, g: pixels[1]!, b: pixels[2]!, a: pixels[3]! };
}

export function expectRGBA(actual: RGBA, expected: RGBA, tolerance = 2): void {
  const fields: (keyof RGBA)[] = ['r', 'g', 'b', 'a'];
  for (const field of fields) {
    const diff = Math.abs(actual[field] - expected[field]);
    if (diff > tolerance) {
      throw new Error(
        `Pixel mismatch on channel "${field}": expected ${expected[field]} ± ${tolerance}, got ${actual[field]} ` +
          `(full actual=${JSON.stringify(actual)}, expected=${JSON.stringify(expected)})`,
      );
    }
  }
}
