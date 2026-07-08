export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Normalizes a drag-drawn rect so width/height are always positive. */
export function normalizeRect(a: { x: number; y: number }, b: { x: number; y: number }): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) };
}

/** True if two axis-aligned rects overlap at all (touching edges do not count). */
export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

/** Ids of all candidate bounds that intersect the marquee rect. */
export function marqueeHits(
  marquee: Rect,
  candidates: ReadonlyArray<{ id: string; bounds: Rect }>,
): string[] {
  return candidates.filter((c) => rectsIntersect(marquee, c.bounds)).map((c) => c.id);
}
