import { describe, expect, it } from 'vitest';
import { handlePositions, resizeBounds } from './handles.js';

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
