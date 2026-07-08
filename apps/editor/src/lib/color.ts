import type { Color } from '@openmake/shared';

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** #rgb / #rrggbb / #rrggbbaa (case-insensitive, optional leading #) → Color (0–1 floats). */
export function hexToColor(hex: string): Color | null {
  const clean = hex.trim().replace(/^#/, '');
  let r: number,
    g: number,
    b: number,
    a = 255;

  if (clean.length === 3) {
    r = parseInt(clean[0]! + clean[0], 16);
    g = parseInt(clean[1]! + clean[1], 16);
    b = parseInt(clean[2]! + clean[2], 16);
  } else if (clean.length === 6 || clean.length === 8) {
    r = parseInt(clean.slice(0, 2), 16);
    g = parseInt(clean.slice(2, 4), 16);
    b = parseInt(clean.slice(4, 6), 16);
    if (clean.length === 8) a = parseInt(clean.slice(6, 8), 16);
  } else {
    return null;
  }

  if ([r, g, b, a].some((c) => Number.isNaN(c))) return null;
  return { r: clamp01(r / 255), g: clamp01(g / 255), b: clamp01(b / 255), a: clamp01(a / 255) };
}

/** Color (0–1 floats) → #rrggbb (alpha channel is exposed separately as opacity in the UI). */
export function colorToHex(color: Color): string {
  const to255 = (c: number) => Math.round(clamp01(c) * 255);
  const toHexByte = (n: number) => n.toString(16).padStart(2, '0');
  return `#${toHexByte(to255(color.r))}${toHexByte(to255(color.g))}${toHexByte(to255(color.b))}`;
}
