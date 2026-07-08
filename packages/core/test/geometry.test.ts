import { describe, expect, it } from 'vitest';
import { OpenDoc } from '../src/index.js';
import {
  DEFAULT_GRID,
  hitTest,
  regularPolygonPoints,
  snapPointToGrid,
  snapToGrid,
  starPoints,
} from '../src/geometry.js';

function newDocWithPage() {
  const doc = OpenDoc.create({ name: 'Test file' });
  const pageId = doc.getPages()[0]!;
  return { doc, pageId };
}

describe('regularPolygonPoints', () => {
  it('generates `count` vertices', () => {
    const points = regularPolygonPoints(100, 100, 5);
    expect(points).toHaveLength(10); // 5 vertices * (x, y)
  });

  it('places the first vertex at the top, centered horizontally', () => {
    const points = regularPolygonPoints(100, 100, 4);
    expect(points[0]).toBeCloseTo(50); // cx
    expect(points[1]).toBeCloseTo(0); // top
  });

  it('inscribes vertices within the bounding box', () => {
    const points = regularPolygonPoints(200, 100, 6);
    for (let i = 0; i < points.length; i += 2) {
      expect(points[i]!).toBeGreaterThanOrEqual(-0.001);
      expect(points[i]!).toBeLessThanOrEqual(200.001);
      expect(points[i + 1]!).toBeGreaterThanOrEqual(-0.001);
      expect(points[i + 1]!).toBeLessThanOrEqual(100.001);
    }
  });
});

describe('starPoints', () => {
  it('generates 2 * count vertices (outer/inner alternating)', () => {
    const points = starPoints(100, 100, 5, 0.5);
    expect(points).toHaveLength(20);
  });

  it('inner vertices are closer to center than outer vertices', () => {
    const points = starPoints(100, 100, 5, 0.5);
    const cx = 50;
    const cy = 50;
    const dist = (x: number, y: number) => Math.hypot(x - cx, y - cy);
    const outer = dist(points[0]!, points[1]!);
    const inner = dist(points[2]!, points[3]!);
    expect(inner).toBeLessThan(outer);
  });
});

describe('hitTest with POLYGON/STAR', () => {
  it('misses a polygon at a bbox corner outside its vertices', () => {
    const { doc, pageId } = newDocWithPage();
    const triangle = doc.createNode({
      type: 'POLYGON',
      parentId: pageId,
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      pointCount: 3,
    });
    // Top-left corner of the bbox is outside a point-up triangle inscribed in it.
    expect(hitTest(doc, pageId, { x: 2, y: 98 })).toBeNull();
    expect(hitTest(doc, pageId, { x: 50, y: 50 })).toBe(triangle);
  });

  it('misses a star between its points, inside the bbox', () => {
    const { doc, pageId } = newDocWithPage();
    const star = doc.createNode({
      type: 'STAR',
      parentId: pageId,
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      pointCount: 5,
      innerRadius: 0.3,
    });
    // Center always hits (all star shapes contain their centroid).
    expect(hitTest(doc, pageId, { x: 50, y: 50 })).toBe(star);
    // A bbox corner is well outside any 5-point star's silhouette.
    expect(hitTest(doc, pageId, { x: 1, y: 1 })).toBeNull();
  });
});

describe('snapToGrid', () => {
  it('rounds to the nearest multiple of the grid', () => {
    expect(snapToGrid(12, 10)).toBe(10);
    expect(snapToGrid(15, 10)).toBe(20); // .5 rounds up
    expect(snapToGrid(17, 10)).toBe(20);
    expect(snapToGrid(-12, 10)).toBe(-10);
  });

  it('defaults to DEFAULT_GRID (integer-pixel snap)', () => {
    expect(DEFAULT_GRID).toBe(1);
    expect(snapToGrid(3.4)).toBe(3);
    expect(snapToGrid(3.6)).toBe(4);
    expect(snapToGrid(-3.6)).toBe(-4);
  });

  it('is a no-op for a zero or negative grid', () => {
    expect(snapToGrid(12.7, 0)).toBe(12.7);
    expect(snapToGrid(12.7, -5)).toBe(12.7);
  });

  it('phase-shifts the grid by origin', () => {
    // Grid of 10 anchored at origin 3 → lattice at 3, 13, 23, ...
    expect(snapToGrid(12, 10, 3)).toBe(13);
    expect(snapToGrid(7, 10, 3)).toBe(3);
    expect(snapToGrid(8, 10, 3)).toBe(13); // .5 rounds up
  });
});

describe('snapPointToGrid', () => {
  it('snaps x and y independently', () => {
    expect(snapPointToGrid({ x: 12, y: 27 }, 10)).toEqual({ x: 10, y: 30 });
  });

  it('applies a per-axis origin', () => {
    // x: grid 10 @ origin 3 → lattice 3,13,23; 12 → 13.
    // y: grid 10 @ origin 7 → lattice 7,17,27; 19 → 17 (nearest, no boundary tie).
    expect(snapPointToGrid({ x: 12, y: 19 }, 10, { x: 3, y: 7 })).toEqual({ x: 13, y: 17 });
  });

  it('is a no-op for a disabled grid', () => {
    expect(snapPointToGrid({ x: 1.7, y: 2.3 }, 0)).toEqual({ x: 1.7, y: 2.3 });
  });
});
