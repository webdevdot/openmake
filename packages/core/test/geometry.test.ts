import { describe, expect, it } from 'vitest';
import { OpenDoc } from '../src/index.js';
import { hitTest, regularPolygonPoints, starPoints } from '../src/geometry.js';

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
