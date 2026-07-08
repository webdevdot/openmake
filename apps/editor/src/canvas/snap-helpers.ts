import type { SnapCandidateBox } from '@openmake/core';

/** Pixel radius within which a candidate attracts the moving box, in screen px. */
export const SNAP_THRESHOLD_PX = 6;

/** Convert core world Bounds (x/y/width/height) to a min/max SnapCandidateBox. */
export function toCandidate(b: {
  x: number;
  y: number;
  width: number;
  height: number;
}): SnapCandidateBox {
  return { minX: b.x, minY: b.y, maxX: b.x + b.width, maxY: b.y + b.height };
}
