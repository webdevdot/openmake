const PRESENCE_COLORS = [
  '#f97316',
  '#eab308',
  '#22c55e',
  '#14b8a6',
  '#0ea5e9',
  '#6366f1',
  '#a855f7',
  '#ec4899',
];

/** WCAG relative luminance channel transform (sRGB -> linear). */
function linearChannel(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** WCAG 2.x relative luminance of a #rgb / #rrggbb hex color. */
function relativeLuminance(hex: string): number {
  let h = hex.replace(/^#/, '');
  if (h.length === 3) {
    h = h
      .split('')
      .map((ch) => ch + ch)
      .join('');
  }
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return 0.2126 * linearChannel(r) + 0.7152 * linearChannel(g) + 0.0722 * linearChannel(b);
}

/** WCAG contrast ratio between two relative luminances. */
function contrastRatio(l1: number, l2: number): number {
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Readable label color for text rendered on a presence swatch background.
 * Returns dark ink when white text would fall below WCAG AA (4.5:1) on the
 * given color, otherwise white.
 */
export function presenceLabelColor(hex: string): string {
  const bg = relativeLuminance(hex);
  const white = 1;
  return contrastRatio(white, bg) < 4.5 ? '#18181b' : '#ffffff';
}

/** Deterministic color for a user id, stable across sessions/clients. */
export function presenceColorForUserId(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash << 5) - hash + userId.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % PRESENCE_COLORS.length;
  return PRESENCE_COLORS[index]!;
}
