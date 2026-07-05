export const DUPLICATE_OFFSET = 10;

/** Position for a cmd+d duplicate: offset from the source so it's visibly distinct. */
export function duplicateOffset(source: { x: number; y: number }): { x: number; y: number } {
  return { x: source.x + DUPLICATE_OFFSET, y: source.y + DUPLICATE_OFFSET };
}
