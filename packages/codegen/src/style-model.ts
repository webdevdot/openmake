import type { Paint, SceneNode } from '@openmake/shared';
import { colorToCss, round2 } from './color.js';

export interface BoxStyle {
  /** CSS declarations, camelCase-ish keys not needed — plain CSS property names. */
  css: Record<string, string>;
  /** Tailwind utility classes, in a stable, readable order. */
  tw: string[];
}

/** First visible SOLID paint in a fill list, if any. */
export function firstSolidFill(fills: Paint[]): Extract<Paint, { type: 'SOLID' }> | undefined {
  return fills.find((f): f is Extract<Paint, { type: 'SOLID' }> => f.type === 'SOLID' && f.visible);
}

/** First visible gradient paint in a fill list, if any. */
export function firstGradientFill(
  fills: Paint[],
): Extract<Paint, { type: 'GRADIENT_LINEAR' | 'GRADIENT_RADIAL' }> | undefined {
  return fills.find(
    (f): f is Extract<Paint, { type: 'GRADIENT_LINEAR' | 'GRADIENT_RADIAL' }> =>
      (f.type === 'GRADIENT_LINEAR' || f.type === 'GRADIENT_RADIAL') && f.visible,
  );
}

/** CSS `linear-gradient(...)` (radial gradients are approximated as linear — no radial center in schema). */
export function gradientToCss(
  gradient: Extract<Paint, { type: 'GRADIENT_LINEAR' | 'GRADIENT_RADIAL' }>,
): string {
  const stops = gradient.stops
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((s) => `${colorToCss(s.color)} ${round2(s.position * 100)}%`)
    .join(', ');
  if (gradient.type === 'GRADIENT_RADIAL') return `radial-gradient(circle, ${stops})`;
  const dx = gradient.to.x - gradient.from.x;
  const dy = gradient.to.y - gradient.from.y;
  const angleDeg = round2(((Math.atan2(dy, dx) * 180) / Math.PI + 90 + 360) % 360);
  return `linear-gradient(${angleDeg}deg, ${stops})`;
}

/** Border (stroke) as a CSS shorthand string, using the first solid stroke paint. */
export function strokeToCss(node: SceneNode): string | undefined {
  if (!('strokes' in node) || node.strokes.length === 0) return undefined;
  const stroke = node.strokes[0];
  if (!stroke) return undefined;
  const solid = stroke.paint.type === 'SOLID' && stroke.paint.visible ? stroke.paint : undefined;
  if (!solid) return undefined;
  return `${round2(stroke.weight)}px solid ${colorToCss(solid.color)}`;
}

/** `box-shadow` CSS value built from DROP_SHADOW effects (INNER_SHADOW uses `inset`). */
export function shadowToCss(node: SceneNode): string | undefined {
  if (!('effects' in node)) return undefined;
  const shadows = node.effects.filter(
    (e): e is Extract<typeof e, { type: 'DROP_SHADOW' | 'INNER_SHADOW' }> =>
      (e.type === 'DROP_SHADOW' || e.type === 'INNER_SHADOW') && e.visible,
  );
  if (shadows.length === 0) return undefined;
  return shadows
    .map((s) => {
      const inset = s.type === 'INNER_SHADOW' ? 'inset ' : '';
      return `${inset}${round2(s.offset.x)}px ${round2(s.offset.y)}px ${round2(s.blur)}px ${round2(
        s.spread,
      )}px ${colorToCss(s.color)}`;
    })
    .join(', ');
}

/** Shared fill/stroke/effect/opacity/corner-radius styling, expressed as both raw CSS and Tailwind classes. */
export function computeBoxStyle(node: SceneNode): BoxStyle {
  const css: Record<string, string> = {};
  const tw: string[] = [];

  const fills = 'fills' in node ? node.fills.filter((f) => f.visible) : [];
  const gradient = firstGradientFill(fills);
  const solid = firstSolidFill(fills);
  if (gradient) {
    css['background-image'] = gradientToCss(gradient);
  } else if (solid) {
    css['background-color'] = colorToCss(solid.color);
    tw.push(`bg-[${colorToCss(solid.color).replace(/\s+/g, '_')}]`);
  }

  if ('cornerRadius' in node && node.cornerRadius > 0) {
    css['border-radius'] = `${round2(node.cornerRadius)}px`;
    tw.push(`rounded-[${round2(node.cornerRadius)}px]`);
  }

  const border = strokeToCss(node);
  if (border) {
    css['border'] = border;
    tw.push(`border-[${border.replace(/\s+/g, '_')}]`);
  }

  const shadow = shadowToCss(node);
  if (shadow) {
    css['box-shadow'] = shadow;
  }

  if (node.opacity < 1) {
    css['opacity'] = `${round2(node.opacity)}`;
    tw.push(`opacity-[${round2(node.opacity)}]`);
  }

  return { css, tw };
}

/** Text-specific CSS/Tailwind declarations. */
export function computeTextStyle(node: Extract<SceneNode, { type: 'TEXT' }>): BoxStyle {
  const css: Record<string, string> = {};
  const tw: string[] = [];
  const style = node.textStyle;

  const fills = node.fills.filter((f) => f.visible);
  const solid = firstSolidFill(fills);
  if (solid) {
    css['color'] = colorToCss(solid.color);
    tw.push(`text-[${colorToCss(solid.color).replace(/\s+/g, '_')}]`);
  }

  css['font-size'] = `${round2(style.fontSize)}px`;
  tw.push(`text-[${round2(style.fontSize)}px]`);

  css['font-weight'] = `${style.fontWeight}`;
  tw.push(`font-[${style.fontWeight}]`);

  if (style.lineHeight !== 'AUTO') {
    css['line-height'] = `${round2(style.lineHeight as number)}`;
    tw.push(`leading-[${round2(style.lineHeight as number)}]`);
  }

  const alignMap: Record<string, string> = {
    LEFT: 'left',
    CENTER: 'center',
    RIGHT: 'right',
    JUSTIFY: 'justify',
  };
  css['text-align'] = alignMap[style.textAlign] ?? 'left';
  tw.push(`text-${alignMap[style.textAlign] ?? 'left'}`);

  return { css, tw };
}
