import type { Color } from '@openmake/shared';

/** Round to 2 decimal places, trimming trailing zeros. */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** `rgb()` for opaque colors, `rgba()` otherwise. Channels are 0–1 floats in the schema. */
export function colorToCss(color: Color): string {
  const r = Math.round(color.r * 255);
  const g = Math.round(color.g * 255);
  const b = Math.round(color.b * 255);
  if (color.a >= 1) return `rgb(${r}, ${g}, ${b})`;
  return `rgba(${r}, ${g}, ${b}, ${round2(color.a)})`;
}

/** Same as {@link colorToCss} but safe to drop inside a Tailwind arbitrary-value bracket. */
export function colorToTailwindArbitrary(color: Color): string {
  return colorToCss(color).replace(/\s+/g, '_');
}
