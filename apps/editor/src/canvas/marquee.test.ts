import { describe, expect, it } from 'vitest';
import { marqueeHits, normalizeRect, rectsIntersect } from './marquee.js';

describe('marquee', () => {
  it('normalizeRect handles drags in any direction', () => {
    expect(normalizeRect({ x: 10, y: 10 }, { x: 30, y: 40 })).toEqual({
      x: 10,
      y: 10,
      width: 20,
      height: 30,
    });
    expect(normalizeRect({ x: 30, y: 40 }, { x: 10, y: 10 })).toEqual({
      x: 10,
      y: 10,
      width: 20,
      height: 30,
    });
  });

  it('rectsIntersect detects overlap and rejects merely-touching rects', () => {
    const a = { x: 0, y: 0, width: 10, height: 10 };
    expect(rectsIntersect(a, { x: 5, y: 5, width: 10, height: 10 })).toBe(true);
    expect(rectsIntersect(a, { x: 10, y: 0, width: 10, height: 10 })).toBe(false);
    expect(rectsIntersect(a, { x: 100, y: 100, width: 10, height: 10 })).toBe(false);
  });

  it('marqueeHits returns only intersecting candidate ids', () => {
    const marquee = { x: 0, y: 0, width: 50, height: 50 };
    const candidates = [
      { id: 'inside', bounds: { x: 10, y: 10, width: 5, height: 5 } },
      { id: 'outside', bounds: { x: 200, y: 200, width: 5, height: 5 } },
      { id: 'overlap', bounds: { x: 40, y: 40, width: 20, height: 20 } },
    ];
    expect(marqueeHits(marquee, candidates).sort()).toEqual(['inside', 'overlap']);
  });
});
