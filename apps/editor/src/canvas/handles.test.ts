import { describe, expect, it } from 'vitest';
import {
  handlePositions,
  resizeBounds,
  boundsCenter,
  rotationAngle,
  snapAngle,
} from './handles.js';

describe('handles', () => {
  it('handlePositions places all 8 handles around the bounds', () => {
    const bounds = { x: 0, y: 0, width: 100, height: 50 };
    const positions = handlePositions(bounds);
    expect(positions.nw).toEqual({ x: 0, y: 0 });
    expect(positions.se).toEqual({ x: 100, y: 50 });
    expect(positions.n).toEqual({ x: 50, y: 0 });
    expect(positions.e).toEqual({ x: 100, y: 25 });
  });

  it('resizeBounds dragging the se handle grows width/height without moving x/y', () => {
    const original = { x: 10, y: 10, width: 100, height: 100 };
    const next = resizeBounds(original, 'se', { x: 20, y: 30 }, false);
    expect(next).toEqual({ x: 10, y: 10, width: 120, height: 130 });
  });

  it('resizeBounds dragging the nw handle moves x/y and shrinks/grows accordingly', () => {
    const original = { x: 10, y: 10, width: 100, height: 100 };
    const next = resizeBounds(original, 'nw', { x: 20, y: 20 }, false);
    expect(next).toEqual({ x: 30, y: 30, width: 80, height: 80 });
  });

  it('resizeBounds with aspectLock preserves the original aspect ratio from a corner', () => {
    const original = { x: 0, y: 0, width: 100, height: 50 };
    const next = resizeBounds(original, 'se', { x: 40, y: 0 }, true);
    expect(next.width).toBeCloseTo(140);
    expect(next.height).toBeCloseTo(70);
  });

  it('resizeBounds normalizes negative width/height by flipping the rect', () => {
    const original = { x: 0, y: 0, width: 50, height: 50 };
    const next = resizeBounds(original, 'se', { x: -100, y: -100 }, false);
    expect(next.width).toBeGreaterThan(0);
    expect(next.height).toBeGreaterThan(0);
  });
});

describe('rotation', () => {
  it('boundsCenter returns the geometric center', () => {
    expect(boundsCenter({ x: 10, y: 20, width: 100, height: 40 })).toEqual({ x: 60, y: 40 });
  });

  it('rotationAngle is 0 when the pointer is directly above the center', () => {
    const center = { x: 50, y: 50 };
    expect(rotationAngle(center, { x: 50, y: 0 })).toBeCloseTo(0);
  });

  it('rotationAngle is 90 to the right, 180 below, -90 to the left', () => {
    const center = { x: 50, y: 50 };
    expect(rotationAngle(center, { x: 100, y: 50 })).toBeCloseTo(90);
    expect(rotationAngle(center, { x: 50, y: 100 })).toBeCloseTo(180);
    expect(rotationAngle(center, { x: 0, y: 50 })).toBeCloseTo(-90);
  });

  it('snapAngle passes the angle through when snap is off, normalized to [0,360)', () => {
    expect(snapAngle(37, false)).toBeCloseTo(37);
    expect(snapAngle(-10, false)).toBeCloseTo(350);
    expect(snapAngle(370, false)).toBeCloseTo(10);
  });

  it('snapAngle rounds to the nearest 15 degrees when snap is on', () => {
    expect(snapAngle(37, true)).toBe(30);
    expect(snapAngle(38, true)).toBe(45);
    expect(snapAngle(-7, true)).toBe(0);
    // 352 is 7° from 345 and 8° from 360, so it snaps down to 345.
    expect(snapAngle(352, true)).toBe(345);
    // 353 is 7° from 360 (→0) and 8° from 345, so it wraps to 0.
    expect(snapAngle(353, true)).toBe(0);
  });
});
