import type {
  CanvasKit,
  Paint as SkPaint,
  Color as SkColor,
  BlendMode as SkBlendMode,
  Image as SkImage,
} from 'canvaskit-wasm';
import type { BlendMode, Color, Effect, ImagePaint, Paint, Stroke } from '@openmake/shared';

export function blendModeToSk(ck: CanvasKit, mode: BlendMode): SkBlendMode {
  const map: Record<BlendMode, SkBlendMode> = {
    NORMAL: ck.BlendMode.SrcOver,
    MULTIPLY: ck.BlendMode.Multiply,
    SCREEN: ck.BlendMode.Screen,
    OVERLAY: ck.BlendMode.Overlay,
    DARKEN: ck.BlendMode.Darken,
    LIGHTEN: ck.BlendMode.Lighten,
    COLOR_DODGE: ck.BlendMode.ColorDodge,
    COLOR_BURN: ck.BlendMode.ColorBurn,
    HARD_LIGHT: ck.BlendMode.HardLight,
    SOFT_LIGHT: ck.BlendMode.SoftLight,
    DIFFERENCE: ck.BlendMode.Difference,
    EXCLUSION: ck.BlendMode.Exclusion,
    HUE: ck.BlendMode.Hue,
    SATURATION: ck.BlendMode.Saturation,
    COLOR: ck.BlendMode.Color,
    LUMINOSITY: ck.BlendMode.Luminosity,
  };
  return map[mode] ?? ck.BlendMode.SrcOver;
}

export function toSkColor(ck: CanvasKit, color: Color, extraOpacity = 1): SkColor {
  return ck.Color4f(color.r, color.g, color.b, color.a * extraOpacity);
}

export interface ImageDecoder {
  (assetId: string): Uint8Array | undefined;
}

/**
 * Builds a fill Paint for a single paint layer (solid/gradient/image), or
 * null if it's invisible / needs image bytes that aren't available.
 */
export function paintToSkPaint(
  ck: CanvasKit,
  paint: Paint,
  nodeWidth: number,
  nodeHeight: number,
  getImageBytes: ImageDecoder,
): SkPaint | null {
  if (!paint.visible) return null;

  switch (paint.type) {
    case 'SOLID': {
      const skPaint = new ck.Paint();
      skPaint.setAntiAlias(true);
      skPaint.setStyle(ck.PaintStyle.Fill);
      skPaint.setColor(toSkColor(ck, paint.color, paint.opacity));
      return skPaint;
    }
    case 'GRADIENT_LINEAR':
    case 'GRADIENT_RADIAL': {
      const skPaint = new ck.Paint();
      skPaint.setAntiAlias(true);
      skPaint.setStyle(ck.PaintStyle.Fill);
      const from = { x: paint.from.x * nodeWidth, y: paint.from.y * nodeHeight };
      const to = { x: paint.to.x * nodeWidth, y: paint.to.y * nodeHeight };
      const colors = paint.stops.map((stop) => toSkColor(ck, stop.color, paint.opacity));
      const positions = paint.stops.map((stop) => stop.position);
      const shader =
        paint.type === 'GRADIENT_LINEAR'
          ? ck.Shader.MakeLinearGradient(
              [from.x, from.y],
              [to.x, to.y],
              colors,
              positions,
              ck.TileMode.Clamp,
            )
          : ck.Shader.MakeRadialGradient(
              [from.x, from.y],
              Math.hypot(to.x - from.x, to.y - from.y) || 1,
              colors,
              positions,
              ck.TileMode.Clamp,
            );
      skPaint.setShader(shader);
      return skPaint;
    }
    case 'IMAGE':
      return imagePaintToSkPaint(ck, paint, nodeWidth, nodeHeight, getImageBytes);
  }
}

function imagePaintToSkPaint(
  ck: CanvasKit,
  paint: ImagePaint,
  nodeWidth: number,
  nodeHeight: number,
  getImageBytes: ImageDecoder,
): SkPaint | null {
  const bytes = getImageBytes(paint.assetId);
  if (!bytes) return null;
  const image = ck.MakeImageFromEncoded(bytes);
  if (!image) return null;

  const skPaint = new ck.Paint();
  skPaint.setAntiAlias(true);
  skPaint.setStyle(ck.PaintStyle.Fill);
  const shader = imageShader(ck, image, paint.scaleMode, nodeWidth, nodeHeight);
  skPaint.setShader(shader);
  skPaint.setAlphaf(paint.opacity);
  image.delete();
  return skPaint;
}

function imageShader(
  ck: CanvasKit,
  image: SkImage,
  scaleMode: 'FILL' | 'FIT' | 'TILE' | 'STRETCH',
  nodeWidth: number,
  nodeHeight: number,
) {
  const iw = image.width();
  const ih = image.height();
  if (scaleMode === 'TILE') {
    return image.makeShaderOptions(
      ck.TileMode.Repeat,
      ck.TileMode.Repeat,
      ck.FilterMode.Linear,
      ck.MipmapMode.None,
    );
  }
  // STRETCH fills the node exactly; FILL/FIT scale uniformly (FILL covers, FIT contains)
  // by pre-scaling via the local matrix so the shader maps image space -> node space.
  let sx = nodeWidth / iw;
  let sy = nodeHeight / ih;
  if (scaleMode === 'FILL') {
    const s = Math.max(sx, sy);
    sx = s;
    sy = s;
  } else if (scaleMode === 'FIT') {
    const s = Math.min(sx, sy);
    sx = s;
    sy = s;
  }
  const tx = (nodeWidth - iw * sx) / 2;
  const ty = (nodeHeight - ih * sy) / 2;
  const matrix = [sx, 0, tx, 0, sy, ty, 0, 0, 1];
  return image.makeShaderOptions(
    ck.TileMode.Clamp,
    ck.TileMode.Clamp,
    ck.FilterMode.Linear,
    ck.MipmapMode.None,
    matrix,
  );
}

/**
 * Builds a stroke Paint for the given stroke definition. INSIDE/OUTSIDE align
 * is approximated by doubling the stroke weight (CENTER is the true weight):
 * true inside/outside stroke geometry would require path offsetting, which
 * CanvasKit doesn't expose directly. Callers additionally clip to the shape
 * for INSIDE alignment (see renderer.ts).
 */
export function strokeToSkPaint(
  ck: CanvasKit,
  stroke: Stroke,
  nodeWidth: number,
  nodeHeight: number,
  getImageBytes: ImageDecoder,
): SkPaint | null {
  const skPaint = paintToSkPaint(ck, stroke.paint, nodeWidth, nodeHeight, getImageBytes);
  if (!skPaint) return null;
  skPaint.setStyle(ck.PaintStyle.Stroke);
  skPaint.setStrokeWidth(stroke.align === 'CENTER' ? stroke.weight : stroke.weight * 2);
  if (stroke.dashPattern && stroke.dashPattern.length > 0) {
    const effect = ck.PathEffect.MakeDash(stroke.dashPattern, 0);
    skPaint.setPathEffect(effect);
  }
  return skPaint;
}

export function applyEffects(ck: CanvasKit, paint: SkPaint, effects: Effect[]): void {
  for (const effect of effects) {
    if (!effect.visible) continue;
    if (effect.type === 'DROP_SHADOW') {
      const color = toSkColor(ck, effect.color);
      const filter = ck.ImageFilter.MakeDropShadow(
        effect.offset.x,
        effect.offset.y,
        effect.blur / 2,
        effect.blur / 2,
        color,
        null,
      );
      paint.setImageFilter(filter);
    } else if (effect.type === 'LAYER_BLUR') {
      const filter = ck.ImageFilter.MakeBlur(
        effect.radius / 2,
        effect.radius / 2,
        ck.TileMode.Decal,
        null,
      );
      paint.setImageFilter(filter);
    }
    // INNER_SHADOW: TODO — approximate via a clipped inset drop-shadow layer; skipped for now.
    // BACKGROUND_BLUR: TODO — requires a backdrop filter on saveLayer; skipped for now.
  }
}
