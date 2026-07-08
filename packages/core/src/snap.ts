import { snapToGrid } from './geometry.js';

/** World-space axis-aligned bounding box, min/max form (snap-friendly). */
export interface SnapCandidateBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * A guide line to render during a snap. `axis: 'x'` is a *vertical* line at a
 * fixed x = `position`, spanning y from `start` to `end`; `axis: 'y'` is a
 * *horizontal* line at a fixed y = `position`, spanning x from `start` to `end`.
 */
export interface SnapGuide {
  axis: 'x' | 'y';
  position: number;
  start: number;
  end: number;
}

export interface SnapConfig {
  /** Grid size in world units; `<= 0` disables grid snapping. */
  grid: number;
  /** Max distance (world units) at which a candidate attracts the moving box. */
  threshold: number;
}

export interface SnapResult {
  /** Additional delta to fold into the raw drag on top of the caller's dx/dy. */
  dx: number;
  dy: number;
  guides: SnapGuide[];
}

/** The three snap lines a box offers on one axis: near edge, center, far edge. */
function linesX(b: SnapCandidateBox): number[] {
  return [b.minX, (b.minX + b.maxX) / 2, b.maxX];
}
function linesY(b: SnapCandidateBox): number[] {
  return [b.minY, (b.minY + b.maxY) / 2, b.maxY];
}

interface AxisSnap {
  delta: number;
  /** World-space line the moving box snapped ONTO (for guide rendering). */
  position: number;
}

/**
 * Resolve the best object snap for one axis: compare each of the moving box's
 * lines against every static line, keep the smallest within-threshold shift.
 * Returns null if nothing is in range. Object-priority (decision A) is enforced
 * by the caller preferring this result over the grid fallback.
 */
function bestObjectSnap(movingLines: number[], staticLines: number[], threshold: number): AxisSnap | null {
  let best: AxisSnap | null = null;
  for (const ml of movingLines) {
    for (const sl of staticLines) {
      const delta = sl - ml;
      if (Math.abs(delta) <= threshold && (best === null || Math.abs(delta) < Math.abs(best.delta))) {
        best = { delta, position: sl };
      }
    }
  }
  return best;
}

/**
 * Compute the snap adjustment for a moving box against static boxes + a grid.
 *
 * Decision A (object-priority, Figma-like): if any static box offers an
 * edge/center within `threshold` on an axis, snap to the nearest such line and
 * emit a guide — even when the grid would be numerically closer. Only when no
 * object is in range on that axis do we fall back to grid snapping (which draws
 * no guide).
 *
 * Pure function: no `doc`/camera coupling. The caller converts node world
 * bounds into {@link SnapCandidateBox} and scales the pixel threshold by zoom.
 */
export function resolveSnap(
  moving: SnapCandidateBox,
  statics: SnapCandidateBox[],
  cfg: SnapConfig,
): SnapResult {
  const guides: SnapGuide[] = [];

  const resolveAxis = (
    movingLines: number[],
    staticsLinesOf: (b: SnapCandidateBox) => number[],
    movingMin: number,
    axis: 'x' | 'y',
  ): number => {
    // Gather every static line on this axis, remembering its owning box so the
    // guide can span both boxes' cross-axis extents.
    let best: (AxisSnap & { owner: SnapCandidateBox }) | null = null;
    for (const s of statics) {
      const hit = bestObjectSnap(movingLines, staticsLinesOf(s), cfg.threshold);
      if (hit && (best === null || Math.abs(hit.delta) < Math.abs(best.delta))) {
        best = { ...hit, owner: s };
      }
    }
    if (best) return snapWithGuide(best, axis, moving);
    // No object in range → grid fallback on the box's min edge, no guide.
    if (cfg.grid > 0) return snapToGrid(movingMin, cfg.grid) - movingMin;
    return 0;
  };

  const snapWithGuide = (
    best: AxisSnap & { owner: SnapCandidateBox },
    axis: 'x' | 'y',
    box: SnapCandidateBox,
  ): number => {
    // Guide spans the union of both boxes' cross-axis extents (post-snap).
    if (axis === 'x') {
      guides.push({
        axis: 'x',
        position: best.position,
        start: Math.min(box.minY, best.owner.minY),
        end: Math.max(box.maxY, best.owner.maxY),
      });
    } else {
      guides.push({
        axis: 'y',
        position: best.position,
        start: Math.min(box.minX, best.owner.minX),
        end: Math.max(box.maxX, best.owner.maxX),
      });
    }
    return best.delta;
  };

  const dx = resolveAxis(linesX(moving), linesX, moving.minX, 'x');
  const dy = resolveAxis(linesY(moving), linesY, moving.minY, 'y');

  return { dx, dy, guides };
}
