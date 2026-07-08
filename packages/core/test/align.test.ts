import { describe, expect, it } from 'vitest';
import { OpenDoc, alignNodes, distributeNodes, flipNode, getWorldBounds } from '../src/index.js';

function newDocWithPage() {
  const doc = OpenDoc.create({ name: 'Test file' });
  const pageId = doc.getPages()[0]!;
  return { doc, pageId };
}

function rect(
  doc: OpenDoc,
  parentId: string,
  x: number,
  y: number,
  width = 10,
  height = 10,
): string {
  return doc.createNode({ type: 'RECTANGLE', parentId, x, y, width, height });
}

function pathOf(doc: OpenDoc, id: string): string {
  const node = doc.getNode(id)!;
  if (node.type !== 'VECTOR') throw new Error('expected VECTOR');
  return node.path;
}

describe('alignNodes (multi-select, within union bbox)', () => {
  it('left aligns every node to the union left edge', () => {
    const { doc, pageId } = newDocWithPage();
    const a = rect(doc, pageId, 0, 0, 10, 10);
    const b = rect(doc, pageId, 40, 20, 30, 10);
    const c = rect(doc, pageId, 15, 60, 5, 10);

    alignNodes(doc, [a, b, c], 'left');

    // Union left edge is x=0 (from `a`); all move so their left edge is 0.
    expect(doc.getNode(a)!.x).toBe(0);
    expect(doc.getNode(b)!.x).toBe(0);
    expect(doc.getNode(c)!.x).toBe(0);
    // Y is untouched.
    expect(doc.getNode(b)!.y).toBe(20);
  });

  it('right aligns every node to the union right edge', () => {
    const { doc, pageId } = newDocWithPage();
    const a = rect(doc, pageId, 0, 0, 10, 10); // right = 10
    const b = rect(doc, pageId, 40, 20, 30, 10); // right = 70 (union right)

    alignNodes(doc, [a, b], 'right');

    expect(doc.getNode(a)!.x).toBe(60); // 70 - 10
    expect(doc.getNode(b)!.x).toBe(40); // already at the right edge
  });

  it('centerX aligns node centers to the union center', () => {
    const { doc, pageId } = newDocWithPage();
    const a = rect(doc, pageId, 0, 0, 10, 10); // center 5
    const b = rect(doc, pageId, 90, 0, 10, 10); // center 95
    // union: x 0..100, center 50.

    alignNodes(doc, [a, b], 'centerX');

    expect(doc.getNode(a)!.x).toBe(45); // center 50
    expect(doc.getNode(b)!.x).toBe(45);
  });

  it('top aligns every node to the union top edge and leaves x alone', () => {
    const { doc, pageId } = newDocWithPage();
    const a = rect(doc, pageId, 0, 30, 10, 10);
    const b = rect(doc, pageId, 40, 5, 10, 10); // union top = 5

    alignNodes(doc, [a, b], 'top');

    expect(doc.getNode(a)!.y).toBe(5);
    expect(doc.getNode(b)!.y).toBe(5);
    expect(doc.getNode(a)!.x).toBe(0);
    expect(doc.getNode(b)!.x).toBe(40);
  });

  it('bottom aligns every node to the union bottom edge', () => {
    const { doc, pageId } = newDocWithPage();
    const a = rect(doc, pageId, 0, 0, 10, 10); // bottom = 10
    const b = rect(doc, pageId, 0, 40, 10, 20); // bottom = 60 (union bottom)

    alignNodes(doc, [a, b], 'bottom');

    expect(doc.getNode(a)!.y).toBe(50); // 60 - 10
    expect(doc.getNode(b)!.y).toBe(40);
  });

  it('centerY aligns node centers vertically to the union center', () => {
    const { doc, pageId } = newDocWithPage();
    const a = rect(doc, pageId, 0, 0, 10, 10); // center 5
    const b = rect(doc, pageId, 0, 90, 10, 10); // center 95, union center 50

    alignNodes(doc, [a, b], 'centerY');

    expect(doc.getNode(a)!.y).toBe(45);
    expect(doc.getNode(b)!.y).toBe(45);
  });
});

describe('alignNodes (single select, within parent FRAME)', () => {
  it('centerX centers the node within its parent frame', () => {
    const { doc, pageId } = newDocWithPage();
    const frame = doc.createNode({
      type: 'FRAME',
      parentId: pageId,
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    });
    const child = rect(doc, frame, 0, 0, 20, 20);

    alignNodes(doc, [child], 'centerX');

    // Frame is 100 wide, child 20 -> centered x = 40 (local, frame at world 0).
    expect(doc.getNode(child)!.x).toBe(40);
    expect(doc.getNode(child)!.y).toBe(0);
  });

  it('right aligns the node to the parent frame right edge', () => {
    const { doc, pageId } = newDocWithPage();
    const frame = doc.createNode({
      type: 'FRAME',
      parentId: pageId,
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    });
    const child = rect(doc, frame, 10, 10, 20, 20);

    alignNodes(doc, [child], 'right');

    expect(doc.getNode(child)!.x).toBe(80); // 100 - 20
  });

  it('is a no-op for a single node with no FRAME ancestor', () => {
    const { doc, pageId } = newDocWithPage();
    const a = rect(doc, pageId, 7, 9, 10, 10); // parent is PAGE, not FRAME

    alignNodes(doc, [a], 'left');

    expect(doc.getNode(a)!.x).toBe(7);
    expect(doc.getNode(a)!.y).toBe(9);
  });
});

describe('alignNodes edge cases', () => {
  it('is a single undo step for a multi-node align', () => {
    const { doc, pageId } = newDocWithPage();
    const a = rect(doc, pageId, 0, 0, 10, 10);
    const b = rect(doc, pageId, 50, 0, 10, 10);
    doc.commitUndoGroup();

    alignNodes(doc, [a, b], 'left');
    doc.commitUndoGroup();

    expect(doc.getNode(b)!.x).toBe(0);
    doc.undo();
    expect(doc.getNode(b)!.x).toBe(50);
    expect(doc.getNode(a)!.x).toBe(0);
  });

  it('is a no-op for an empty id list', () => {
    const { doc, pageId } = newDocWithPage();
    const a = rect(doc, pageId, 3, 4, 10, 10);
    alignNodes(doc, [], 'left');
    expect(doc.getNode(a)!.x).toBe(3);
  });
});

describe('distributeNodes', () => {
  it('evenly spaces centers horizontally, pinning the outer nodes', () => {
    const { doc, pageId } = newDocWithPage();
    const a = rect(doc, pageId, 0, 0, 10, 10); // center 5
    const b = rect(doc, pageId, 20, 0, 10, 10); // center 25 (will move)
    const c = rect(doc, pageId, 90, 0, 10, 10); // center 95

    distributeNodes(doc, [a, b, c], 'x');

    // Even spacing: centers at 5, 50, 95 -> middle rect center 50 -> x = 45.
    expect(doc.getNode(a)!.x).toBe(0);
    expect(doc.getNode(c)!.x).toBe(90);
    expect(doc.getNode(b)!.x).toBe(45);
  });

  it('evenly spaces centers vertically', () => {
    const { doc, pageId } = newDocWithPage();
    const a = rect(doc, pageId, 0, 0, 10, 10); // center 5
    const b = rect(doc, pageId, 0, 10, 10, 10); // center 15
    const c = rect(doc, pageId, 0, 100, 10, 10); // center 105

    distributeNodes(doc, [a, b, c], 'y');

    // centers 5, 55, 105 -> middle rect center 55 -> y = 50.
    expect(doc.getNode(b)!.y).toBe(50);
    expect(doc.getNode(a)!.y).toBe(0);
    expect(doc.getNode(c)!.y).toBe(100);
  });

  it('sorts by position before distributing, regardless of id order', () => {
    const { doc, pageId } = newDocWithPage();
    const a = rect(doc, pageId, 0, 0, 10, 10); // center 5
    const b = rect(doc, pageId, 90, 0, 10, 10); // center 95
    const mid = rect(doc, pageId, 20, 0, 10, 10); // center 25

    // Pass the middle node last; it must still land between a and b.
    distributeNodes(doc, [a, b, mid], 'x');

    expect(doc.getNode(mid)!.x).toBe(45); // center 50
  });

  it('is a no-op with fewer than 3 nodes', () => {
    const { doc, pageId } = newDocWithPage();
    const a = rect(doc, pageId, 0, 0, 10, 10);
    const b = rect(doc, pageId, 50, 0, 10, 10);

    distributeNodes(doc, [a, b], 'x');

    expect(doc.getNode(a)!.x).toBe(0);
    expect(doc.getNode(b)!.x).toBe(50);
  });
});

describe('flipNode', () => {
  it('flips a non-vector node orientation across X (rotation -> -rotation)', () => {
    const { doc, pageId } = newDocWithPage();
    const r = doc.createNode({
      type: 'RECTANGLE',
      parentId: pageId,
      x: 0,
      y: 0,
      width: 20,
      height: 10,
      rotation: 30,
    });

    flipNode(doc, r, 'x');

    expect(doc.getNode(r)!.rotation).toBe(-30);
    // Size preserved.
    expect(doc.getNode(r)!.width).toBe(20);
    expect(doc.getNode(r)!.height).toBe(10);
  });

  it('flips a non-vector node orientation across Y (rotation -> 180 - rotation)', () => {
    const { doc, pageId } = newDocWithPage();
    const r = doc.createNode({
      type: 'RECTANGLE',
      parentId: pageId,
      x: 0,
      y: 0,
      width: 20,
      height: 10,
      rotation: 30,
    });

    flipNode(doc, r, 'y');

    expect(doc.getNode(r)!.rotation).toBe(150); // 180 - 30
  });

  it('normalizes the flipped angle into (-180, 180]', () => {
    const { doc, pageId } = newDocWithPage();
    const r = doc.createNode({
      type: 'RECTANGLE',
      parentId: pageId,
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      rotation: 170,
    });

    flipNode(doc, r, 'y'); // 180 - 170 = 10

    expect(doc.getNode(r)!.rotation).toBe(10);
  });

  it('mirrors VECTOR path coordinates within the node box across X', () => {
    const { doc, pageId } = newDocWithPage();
    const v = doc.createNode({
      type: 'VECTOR',
      parentId: pageId,
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      path: 'M 10 20 L 30 40',
    });

    flipNode(doc, v, 'x');

    // x -> width - x ; y unchanged.
    expect(pathOf(doc, v)).toBe('M 90 20 L 70 40');
  });

  it('mirrors VECTOR path coordinates within the node box across Y', () => {
    const { doc, pageId } = newDocWithPage();
    const v = doc.createNode({
      type: 'VECTOR',
      parentId: pageId,
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      path: 'M 10 20 L 30 40',
    });

    flipNode(doc, v, 'y');

    // y -> height - y ; x unchanged.
    expect(pathOf(doc, v)).toBe('M 10 80 L 30 60');
  });

  it('is a no-op for a missing node', () => {
    const { doc } = newDocWithPage();
    expect(() => flipNode(doc, 'does-not-exist', 'x')).not.toThrow();
  });
});

describe('alignNodes respects world bounds under a rotated ancestor', () => {
  it('left-aligns using rotation-aware world AABBs', () => {
    const { doc, pageId } = newDocWithPage();
    // Two rects; align by their world AABB left edges.
    const a = rect(doc, pageId, 100, 0, 10, 10); // world left 100
    const b = rect(doc, pageId, 30, 0, 10, 10); // world left 30 (union left)

    alignNodes(doc, [a, b], 'left');

    expect(getWorldBounds(doc, a).x).toBeCloseTo(30);
    expect(getWorldBounds(doc, b).x).toBeCloseTo(30);
  });
});
