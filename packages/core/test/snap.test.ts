import { describe, expect, it } from 'vitest';
import { resolveSnap, type SnapCandidateBox, type SnapConfig } from '../src/snap.js';

const box = (minX: number, minY: number, w: number, h: number): SnapCandidateBox => ({
  minX,
  minY,
  maxX: minX + w,
  maxY: minY + h,
});

// Grid off (0), generous threshold so only object snapping is under test.
const objOnly: SnapConfig = { grid: 0, threshold: 8 };

describe('resolveSnap — object edge alignment (decision A: object-priority)', () => {
  it('snaps a left edge to a nearby static left edge', () => {
    // moving left edge at x=103, static left edge at x=100, within threshold 8.
    const moving = box(103, 50, 20, 20);
    const statics = [box(100, 200, 40, 40)];
    const r = resolveSnap(moving, statics, objOnly);
    expect(r.dx).toBe(-3); // pulled left onto x=100
    expect(r.dy).toBe(0);
    expect(r.guides.some((g) => g.axis === 'x' && g.position === 100)).toBe(true);
  });

  it('snaps center-to-center on an axis', () => {
    // moving centerX = 104, static centerX = 100.
    const moving = box(94, 50, 20, 20); // centerX 104
    const statics = [box(80, 300, 40, 40)]; // centerX 100
    const r = resolveSnap(moving, statics, objOnly);
    expect(r.dx).toBe(-4);
    expect(r.guides.some((g) => g.axis === 'x' && g.position === 100)).toBe(true);
  });

  it('does not snap when every line-pair is beyond threshold', () => {
    // moving x-lines [500,510,520]; static x-lines [100,120,140] — all >8 apart.
    const moving = box(500, 500, 20, 20);
    const statics = [box(100, 100, 40, 40)];
    const r = resolveSnap(moving, statics, objOnly);
    expect(r).toEqual({ dx: 0, dy: 0, guides: [] });
  });

  it('snaps to the only candidate line within threshold, ignoring out-of-range boxes', () => {
    // moving x-lines: [105, 115, 125]
    const moving = box(105, 50, 20, 20);
    // A x-lines: [90, 92, 94] — nearest to any moving line is 94↔105 = Δ11 (>8, out of range)
    // B x-lines: [100, 102, 104] — 104↔105 = Δ1 (in range, the only in-range pair)
    const statics = [box(90, 200, 4, 4), box(100, 400, 4, 4)];
    const r = resolveSnap(moving, statics, objOnly);
    expect(r.dx).toBe(-1); // pulled left edge 105 onto B's right edge 104
    expect(r.guides.some((g) => g.axis === 'x' && g.position === 104)).toBe(true);
  });
});

describe('resolveSnap — grid fallback', () => {
  it('falls back to grid snap when no object is in range', () => {
    const moving = box(103, 47, 20, 20);
    const cfg: SnapConfig = { grid: 10, threshold: 8 };
    const r = resolveSnap(moving, [], cfg);
    expect(r.dx).toBe(-3); // 103 -> 100
    expect(r.dy).toBe(3); // 47 -> 50
    // grid snaps do not draw object guides
    expect(r.guides).toEqual([]);
  });

  it('object candidate beats grid when both are in range (object-priority)', () => {
    // left edge 103: grid(10) would pull to 100 (dx -3); object edge at 104 (dx +1).
    // Decision A: object wins even though grid is numerically closer on this axis.
    const moving = box(103, 500, 20, 20);
    const statics = [box(104, 500, 20, 20)];
    const cfg: SnapConfig = { grid: 10, threshold: 8 };
    const r = resolveSnap(moving, statics, cfg);
    expect(r.dx).toBe(1); // snapped to object edge 104, not grid 100
    expect(r.guides.some((g) => g.axis === 'x' && g.position === 104)).toBe(true);
  });
});

describe('resolveSnap — guide geometry', () => {
  it('guide spans from the moving box to the aligned static box', () => {
    const moving = box(103, 50, 20, 20); // y 50..70
    const statics = [box(100, 200, 40, 40)]; // y 200..240
    const r = resolveSnap(moving, statics, objOnly);
    const g = r.guides.find((gg) => gg.axis === 'x' && gg.position === 100)!;
    expect(g).toBeDefined();
    // vertical guide at x=100 should cover both boxes' y-extents (50..240 after snap)
    expect(g.start).toBeLessThanOrEqual(50);
    expect(g.end).toBeGreaterThanOrEqual(240);
  });
});
