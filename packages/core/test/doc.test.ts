import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { DocumentDataSchema } from '@openmake/shared';
import { OpenDoc, getWorldBounds, hitTest, resolveInstance } from '../src/index.js';

function newDocWithPage() {
  const doc = OpenDoc.create({ name: 'Test file' });
  const pageId = doc.getPages()[0]!;
  return { doc, pageId };
}

describe('OpenDoc.create', () => {
  it('creates a DOCUMENT root with one PAGE child', () => {
    const { doc, pageId } = newDocWithPage();
    const root = doc.getNode(doc.rootId);
    expect(root?.type).toBe('DOCUMENT');
    expect(doc.getChildrenIds(doc.rootId)).toEqual([pageId]);
    expect(doc.getNode(pageId)?.type).toBe('PAGE');
  });

  it('fills schema defaults on created nodes', () => {
    const { doc, pageId } = newDocWithPage();
    const id = doc.createNode({ type: 'RECTANGLE', parentId: pageId });
    const node = doc.getNode(id);
    expect(node).toMatchObject({ type: 'RECTANGLE', visible: true, opacity: 1, blendMode: 'NORMAL' });
  });
});

describe('mutations', () => {
  it('createNode appends to parent children and sets parent linkage', () => {
    const { doc, pageId } = newDocWithPage();
    const a = doc.createNode({ type: 'RECTANGLE', parentId: pageId });
    const b = doc.createNode({ type: 'ELLIPSE', parentId: pageId });
    expect(doc.getChildrenIds(pageId)).toEqual([a, b]);
    expect(doc.getParentId(a)).toBe(pageId);
  });

  it('createNode inserts at an explicit index', () => {
    const { doc, pageId } = newDocWithPage();
    const a = doc.createNode({ type: 'RECTANGLE', parentId: pageId });
    const b = doc.createNode({ type: 'RECTANGLE', parentId: pageId });
    const c = doc.createNode({ type: 'RECTANGLE', parentId: pageId, index: 1 });
    expect(doc.getChildrenIds(pageId)).toEqual([a, c, b]);
  });

  it('createNode rejects a non-container parent', () => {
    const { doc, pageId } = newDocWithPage();
    const rect = doc.createNode({ type: 'RECTANGLE', parentId: pageId });
    expect(() => doc.createNode({ type: 'RECTANGLE', parentId: rect })).toThrow(/container/i);
  });

  it('updateNode merges props', () => {
    const { doc, pageId } = newDocWithPage();
    const id = doc.createNode({ type: 'RECTANGLE', parentId: pageId, x: 10 });
    doc.updateNode(id, { x: 42, name: 'Hero' });
    expect(doc.getNode(id)).toMatchObject({ x: 42, name: 'Hero' });
  });

  it('deleteNode removes the whole subtree', () => {
    const { doc, pageId } = newDocWithPage();
    const frame = doc.createNode({ type: 'FRAME', parentId: pageId });
    const child = doc.createNode({ type: 'TEXT', parentId: frame });
    doc.deleteNode(frame);
    expect(doc.getNode(frame)).toBeUndefined();
    expect(doc.getNode(child)).toBeUndefined();
    expect(doc.getChildrenIds(pageId)).toEqual([]);
  });

  it('moveNode reparents and preserves order', () => {
    const { doc, pageId } = newDocWithPage();
    const f1 = doc.createNode({ type: 'FRAME', parentId: pageId });
    const f2 = doc.createNode({ type: 'FRAME', parentId: pageId });
    const rect = doc.createNode({ type: 'RECTANGLE', parentId: f1 });
    doc.moveNode(rect, f2);
    expect(doc.getChildrenIds(f1)).toEqual([]);
    expect(doc.getChildrenIds(f2)).toEqual([rect]);
    expect(doc.getParentId(rect)).toBe(f2);
  });

  it('moveNode rejects cycles', () => {
    const { doc, pageId } = newDocWithPage();
    const outer = doc.createNode({ type: 'FRAME', parentId: pageId });
    const inner = doc.createNode({ type: 'FRAME', parentId: outer });
    expect(() => doc.moveNode(outer, inner)).toThrow(/cycle/i);
  });

  it('moveNode reorders within the same parent', () => {
    const { doc, pageId } = newDocWithPage();
    const a = doc.createNode({ type: 'RECTANGLE', parentId: pageId });
    const b = doc.createNode({ type: 'RECTANGLE', parentId: pageId });
    doc.moveNode(b, pageId, 0);
    expect(doc.getChildrenIds(pageId)).toEqual([b, a]);
  });
});

describe('undo/redo', () => {
  it('undoes and redoes local edits', () => {
    const { doc, pageId } = newDocWithPage();
    const id = doc.createNode({ type: 'RECTANGLE', parentId: pageId });
    expect(doc.canUndo()).toBe(true);
    doc.undo();
    expect(doc.getNode(id)).toBeUndefined();
    doc.redo();
    expect(doc.getNode(id)?.type).toBe('RECTANGLE');
  });

  it('does not undo remote edits', () => {
    const { doc } = newDocWithPage();
    const remote = OpenDoc.create({ name: 'remote' });
    // Simulate a remote update arriving (different origin — not tracked by UndoManager).
    const remotePage = remote.getPages()[0]!;
    remote.createNode({ type: 'RECTANGLE', parentId: remotePage });
    Y.applyUpdate(doc.ydoc, Y.encodeStateAsUpdate(remote.ydoc), 'remote');
    doc.undo(); // must be a no-op: nothing local to undo
    const merged = doc.toJSON();
    expect(Object.values(merged.nodes).some((n) => n.type === 'RECTANGLE')).toBe(true);
  });
});

describe('subscription', () => {
  it('notifies with changed node ids and bumps version', () => {
    const { doc, pageId } = newDocWithPage();
    const seen: string[][] = [];
    const v0 = doc.version;
    const unsubscribe = doc.subscribe((ids) => seen.push([...ids]));
    const id = doc.createNode({ type: 'RECTANGLE', parentId: pageId });
    expect(doc.version).toBeGreaterThan(v0);
    expect(seen.flat()).toContain(id);
    unsubscribe();
    doc.createNode({ type: 'RECTANGLE', parentId: pageId });
    expect(seen.length).toBe(1);
  });
});

describe('serialization', () => {
  it('toJSON produces schema-valid data and roundtrips through fromJSON', () => {
    const { doc, pageId } = newDocWithPage();
    doc.createNode({
      type: 'TEXT',
      parentId: pageId,
      characters: 'Hello openmake',
      x: 5,
      y: 7,
    });
    const json = doc.toJSON();
    expect(() => DocumentDataSchema.parse(json)).not.toThrow();
    const restored = OpenDoc.fromJSON(json);
    expect(restored.toJSON()).toEqual(json);
  });
});

describe('CRDT sync', () => {
  it('two documents converge after exchanging updates', () => {
    const a = OpenDoc.create({ name: 'converge' });
    const b = OpenDoc.fromYDoc(new Y.Doc());
    Y.applyUpdate(b.ydoc, Y.encodeStateAsUpdate(a.ydoc));

    const pageA = a.getPages()[0]!;
    const pageB = b.getPages()[0]!;
    a.createNode({ type: 'RECTANGLE', parentId: pageA, name: 'from-a' });
    b.createNode({ type: 'ELLIPSE', parentId: pageB, name: 'from-b' });

    Y.applyUpdate(b.ydoc, Y.encodeStateAsUpdate(a.ydoc));
    Y.applyUpdate(a.ydoc, Y.encodeStateAsUpdate(b.ydoc));

    expect(a.toJSON()).toEqual(b.toJSON());
    expect(a.getChildrenIds(pageA)).toHaveLength(2);
  });
});

describe('geometry', () => {
  it('computes world bounds through nested offsets', () => {
    const { doc, pageId } = newDocWithPage();
    const frame = doc.createNode({ type: 'FRAME', parentId: pageId, x: 100, y: 50 });
    const rect = doc.createNode({ type: 'RECTANGLE', parentId: frame, x: 10, y: 20, width: 30, height: 40 });
    expect(getWorldBounds(doc, rect)).toEqual({ x: 110, y: 70, width: 30, height: 40 });
  });

  it('accounts for rotation in world bounds', () => {
    const { doc, pageId } = newDocWithPage();
    const rect = doc.createNode({
      type: 'RECTANGLE', parentId: pageId, x: 0, y: 0, width: 100, height: 50, rotation: 90,
    });
    const b = getWorldBounds(doc, rect);
    // Rotated 90° about its center: AABB becomes 50x100 around the same center.
    expect(b.width).toBeCloseTo(50, 5);
    expect(b.height).toBeCloseTo(100, 5);
    expect(b.x).toBeCloseTo(25, 5);
    expect(b.y).toBeCloseTo(-25, 5);
  });

  it('hitTest returns the topmost node at a point', () => {
    const { doc, pageId } = newDocWithPage();
    const bottom = doc.createNode({ type: 'RECTANGLE', parentId: pageId, x: 0, y: 0, width: 100, height: 100 });
    const top = doc.createNode({ type: 'RECTANGLE', parentId: pageId, x: 50, y: 50, width: 100, height: 100 });
    expect(hitTest(doc, pageId, { x: 75, y: 75 })).toBe(top);
    expect(hitTest(doc, pageId, { x: 10, y: 10 })).toBe(bottom);
    expect(hitTest(doc, pageId, { x: 500, y: 500 })).toBeNull();
  });

  it('hitTest skips invisible nodes and respects ellipse shape', () => {
    const { doc, pageId } = newDocWithPage();
    const ellipse = doc.createNode({ type: 'ELLIPSE', parentId: pageId, x: 0, y: 0, width: 100, height: 100 });
    doc.createNode({ type: 'RECTANGLE', parentId: pageId, x: 0, y: 0, width: 10, height: 10, visible: false });
    // Corner of the ellipse's bounding box is outside the ellipse itself.
    expect(hitTest(doc, pageId, { x: 2, y: 2 })).toBeNull();
    expect(hitTest(doc, pageId, { x: 50, y: 50 })).toBe(ellipse);
  });

  it('hitTest descends into frames and returns children above the frame', () => {
    const { doc, pageId } = newDocWithPage();
    const frame = doc.createNode({ type: 'FRAME', parentId: pageId, x: 0, y: 0, width: 200, height: 200 });
    const child = doc.createNode({ type: 'RECTANGLE', parentId: frame, x: 10, y: 10, width: 50, height: 50 });
    expect(hitTest(doc, pageId, { x: 30, y: 30 })).toBe(child);
    expect(hitTest(doc, pageId, { x: 150, y: 150 })).toBe(frame);
  });
});

describe('components & instances', () => {
  it('converts a frame to a component and instantiates it with overrides', () => {
    const { doc, pageId } = newDocWithPage();
    const frame = doc.createNode({ type: 'FRAME', parentId: pageId, width: 120, height: 40 });
    const label = doc.createNode({ type: 'TEXT', parentId: frame, characters: 'Button' });
    const componentId = doc.createComponentFromNode(frame);
    expect(doc.getNode(componentId)?.type).toBe('COMPONENT');

    const instanceId = doc.createInstance(componentId, pageId, { x: 300, y: 10 });
    const inst = doc.getNode(instanceId);
    expect(inst).toMatchObject({ type: 'INSTANCE', x: 300, width: 120, height: 40 });

    doc.updateNode(instanceId, {
      overrides: { [label]: { characters: 'Save changes' } },
    });
    const resolved = resolveInstance(doc, instanceId);
    const texts = Object.values(resolved.nodes).filter((n) => n.type === 'TEXT');
    expect(texts).toHaveLength(1);
    expect((texts[0] as { characters: string }).characters).toBe('Save changes');
    // Resolved root carries the instance's placement.
    expect(resolved.nodes[resolved.rootId]).toMatchObject({ x: 300, y: 10, width: 120, height: 40 });
  });
});

describe('variables and styles', () => {
  it('stores and retrieves variables', () => {
    const { doc } = newDocWithPage();
    doc.setVariable({
      id: 'var_primary',
      name: 'color/primary',
      type: 'COLOR',
      valuesByMode: { default: { r: 0, g: 0.5, b: 1, a: 1 } },
    });
    expect(doc.getVariables()['var_primary']?.name).toBe('color/primary');
    const json = doc.toJSON();
    expect(json.variables['var_primary']?.type).toBe('COLOR');
  });
});
