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
    expect(node).toMatchObject({
      type: 'RECTANGLE',
      visible: true,
      opacity: 1,
      blendMode: 'NORMAL',
    });
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
    const rect = doc.createNode({
      type: 'RECTANGLE',
      parentId: frame,
      x: 10,
      y: 20,
      width: 30,
      height: 40,
    });
    expect(getWorldBounds(doc, rect)).toEqual({ x: 110, y: 70, width: 30, height: 40 });
  });

  it('accounts for rotation in world bounds', () => {
    const { doc, pageId } = newDocWithPage();
    const rect = doc.createNode({
      type: 'RECTANGLE',
      parentId: pageId,
      x: 0,
      y: 0,
      width: 100,
      height: 50,
      rotation: 90,
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
    const bottom = doc.createNode({
      type: 'RECTANGLE',
      parentId: pageId,
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    });
    const top = doc.createNode({
      type: 'RECTANGLE',
      parentId: pageId,
      x: 50,
      y: 50,
      width: 100,
      height: 100,
    });
    expect(hitTest(doc, pageId, { x: 75, y: 75 })).toBe(top);
    expect(hitTest(doc, pageId, { x: 10, y: 10 })).toBe(bottom);
    expect(hitTest(doc, pageId, { x: 500, y: 500 })).toBeNull();
  });

  it('hitTest skips invisible nodes and respects ellipse shape', () => {
    const { doc, pageId } = newDocWithPage();
    const ellipse = doc.createNode({
      type: 'ELLIPSE',
      parentId: pageId,
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    });
    doc.createNode({
      type: 'RECTANGLE',
      parentId: pageId,
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      visible: false,
    });
    // Corner of the ellipse's bounding box is outside the ellipse itself.
    expect(hitTest(doc, pageId, { x: 2, y: 2 })).toBeNull();
    expect(hitTest(doc, pageId, { x: 50, y: 50 })).toBe(ellipse);
  });

  it('hitTest descends into frames and returns children above the frame', () => {
    const { doc, pageId } = newDocWithPage();
    const frame = doc.createNode({
      type: 'FRAME',
      parentId: pageId,
      x: 0,
      y: 0,
      width: 200,
      height: 200,
    });
    const child = doc.createNode({
      type: 'RECTANGLE',
      parentId: frame,
      x: 10,
      y: 10,
      width: 50,
      height: 50,
    });
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
    expect(resolved.nodes[resolved.rootId]).toMatchObject({
      x: 300,
      y: 10,
      width: 120,
      height: 40,
    });
  });
});

describe('group / ungroup', () => {
  it('wraps siblings in a GROUP and reparents them', () => {
    const { doc, pageId } = newDocWithPage();
    const a = doc.createNode({ type: 'RECTANGLE', parentId: pageId, x: 10, y: 10, width: 20, height: 20 });
    const b = doc.createNode({ type: 'RECTANGLE', parentId: pageId, x: 60, y: 40, width: 20, height: 20 });
    const groupId = doc.groupNodes([a, b]);

    expect(doc.getNode(groupId)?.type).toBe('GROUP');
    expect(doc.getParentId(groupId)).toBe(pageId);
    expect(doc.getParentId(a)).toBe(groupId);
    expect(doc.getParentId(b)).toBe(groupId);
    expect(doc.getChildrenIds(groupId)).toEqual([a, b]);
    expect(doc.getChildrenIds(pageId)).toEqual([groupId]);
  });

  it('sizes the group to the union of member world bounds', () => {
    const { doc, pageId } = newDocWithPage();
    const a = doc.createNode({ type: 'RECTANGLE', parentId: pageId, x: 10, y: 10, width: 20, height: 20 });
    const b = doc.createNode({ type: 'RECTANGLE', parentId: pageId, x: 60, y: 40, width: 20, height: 20 });
    const groupId = doc.groupNodes([a, b]);
    // Union of [10,10..30,30] and [60,40..80,60] -> origin (10,10), size 70x50.
    expect(getWorldBounds(doc, groupId)).toEqual({ x: 10, y: 10, width: 70, height: 50 });
  });

  it('preserves each member world position when grouping', () => {
    const { doc, pageId } = newDocWithPage();
    const a = doc.createNode({ type: 'RECTANGLE', parentId: pageId, x: 10, y: 10, width: 20, height: 20 });
    const b = doc.createNode({ type: 'RECTANGLE', parentId: pageId, x: 60, y: 40, width: 20, height: 20 });
    const beforeA = getWorldBounds(doc, a);
    const beforeB = getWorldBounds(doc, b);
    doc.groupNodes([a, b]);
    expect(getWorldBounds(doc, a)).toEqual(beforeA);
    expect(getWorldBounds(doc, b)).toEqual(beforeB);
  });

  it('groups within a transformed parent frame without shifting members', () => {
    const { doc, pageId } = newDocWithPage();
    const frame = doc.createNode({ type: 'FRAME', parentId: pageId, x: 100, y: 50 });
    const a = doc.createNode({ type: 'RECTANGLE', parentId: frame, x: 10, y: 10, width: 20, height: 20 });
    const b = doc.createNode({ type: 'RECTANGLE', parentId: frame, x: 40, y: 30, width: 20, height: 20 });
    const beforeA = getWorldBounds(doc, a);
    const beforeB = getWorldBounds(doc, b);
    const groupId = doc.groupNodes([a, b]);
    expect(doc.getParentId(groupId)).toBe(frame);
    expect(getWorldBounds(doc, a)).toEqual(beforeA);
    expect(getWorldBounds(doc, b)).toEqual(beforeB);
  });

  it('keeps member z-order regardless of selection order', () => {
    const { doc, pageId } = newDocWithPage();
    const a = doc.createNode({ type: 'RECTANGLE', parentId: pageId });
    const b = doc.createNode({ type: 'RECTANGLE', parentId: pageId });
    const c = doc.createNode({ type: 'RECTANGLE', parentId: pageId });
    // Select out of document order; group must restore z-order a,b,c.
    const groupId = doc.groupNodes([c, a, b]);
    expect(doc.getChildrenIds(groupId)).toEqual([a, b, c]);
  });

  it('inserts the group at the topmost member slot, keeping siblings stacked', () => {
    const { doc, pageId } = newDocWithPage();
    const back = doc.createNode({ type: 'RECTANGLE', parentId: pageId });
    const a = doc.createNode({ type: 'RECTANGLE', parentId: pageId });
    const b = doc.createNode({ type: 'RECTANGLE', parentId: pageId });
    const front = doc.createNode({ type: 'RECTANGLE', parentId: pageId });
    const groupId = doc.groupNodes([a, b]);
    // back stays below, front stays above; group takes the topmost member's slot.
    expect(doc.getChildrenIds(pageId)).toEqual([back, groupId, front]);
  });

  it('rejects grouping an empty selection', () => {
    const { doc } = newDocWithPage();
    expect(() => doc.groupNodes([])).toThrow(/empty selection/i);
  });

  it('rejects grouping nodes with different parents', () => {
    const { doc, pageId } = newDocWithPage();
    const f1 = doc.createNode({ type: 'FRAME', parentId: pageId });
    const f2 = doc.createNode({ type: 'FRAME', parentId: pageId });
    const a = doc.createNode({ type: 'RECTANGLE', parentId: f1 });
    const b = doc.createNode({ type: 'RECTANGLE', parentId: f2 });
    expect(() => doc.groupNodes([a, b])).toThrow(/same parent/i);
  });

  it('ungroup dissolves the group and reparents children into its slot', () => {
    const { doc, pageId } = newDocWithPage();
    const a = doc.createNode({ type: 'RECTANGLE', parentId: pageId, x: 10, y: 10, width: 20, height: 20 });
    const b = doc.createNode({ type: 'RECTANGLE', parentId: pageId, x: 60, y: 40, width: 20, height: 20 });
    const groupId = doc.groupNodes([a, b]);

    const freed = doc.ungroupNodes(groupId);
    expect(freed).toEqual([a, b]);
    expect(doc.getNode(groupId)).toBeUndefined();
    expect(doc.getParentId(a)).toBe(pageId);
    expect(doc.getParentId(b)).toBe(pageId);
    expect(doc.getChildrenIds(pageId)).toEqual([a, b]);
  });

  it('preserves member world positions across a group -> ungroup round trip', () => {
    const { doc, pageId } = newDocWithPage();
    const frame = doc.createNode({ type: 'FRAME', parentId: pageId, x: 100, y: 50 });
    const a = doc.createNode({ type: 'RECTANGLE', parentId: frame, x: 10, y: 10, width: 20, height: 20 });
    const b = doc.createNode({ type: 'RECTANGLE', parentId: frame, x: 40, y: 30, width: 20, height: 20 });
    const beforeA = getWorldBounds(doc, a);
    const beforeB = getWorldBounds(doc, b);
    const groupId = doc.groupNodes([a, b]);
    doc.ungroupNodes(groupId);
    expect(doc.getParentId(a)).toBe(frame);
    expect(getWorldBounds(doc, a)).toEqual(beforeA);
    expect(getWorldBounds(doc, b)).toEqual(beforeB);
  });

  it('ungroup restores children into the group\'s stacking slot', () => {
    const { doc, pageId } = newDocWithPage();
    const back = doc.createNode({ type: 'RECTANGLE', parentId: pageId });
    const a = doc.createNode({ type: 'RECTANGLE', parentId: pageId });
    const b = doc.createNode({ type: 'RECTANGLE', parentId: pageId });
    const front = doc.createNode({ type: 'RECTANGLE', parentId: pageId });
    const groupId = doc.groupNodes([a, b]);
    doc.ungroupNodes(groupId);
    expect(doc.getChildrenIds(pageId)).toEqual([back, a, b, front]);
  });

  it('rejects ungrouping a node without a parent', () => {
    const { doc } = newDocWithPage();
    expect(() => doc.ungroupNodes(doc.rootId)).toThrow(/no parent/i);
  });

  it('rejects ungrouping a node that does not exist', () => {
    const { doc } = newDocWithPage();
    expect(() => doc.ungroupNodes('node_missing')).toThrow(/does not exist/i);
  });

  it('groups as a single undoable step', () => {
    const { doc, pageId } = newDocWithPage();
    const a = doc.createNode({ type: 'RECTANGLE', parentId: pageId });
    const b = doc.createNode({ type: 'RECTANGLE', parentId: pageId });
    doc.commitUndoGroup(); // isolate the group op from the node creations
    const groupId = doc.groupNodes([a, b]);

    doc.undo();
    expect(doc.getNode(groupId)).toBeUndefined();
    expect(doc.getChildrenIds(pageId)).toEqual([a, b]);
    expect(doc.getParentId(a)).toBe(pageId);

    doc.redo();
    expect(doc.getNode(groupId)?.type).toBe('GROUP');
    expect(doc.getChildrenIds(groupId)).toEqual([a, b]);
  });

  it('ungroups as a single undoable step', () => {
    const { doc, pageId } = newDocWithPage();
    const a = doc.createNode({ type: 'RECTANGLE', parentId: pageId });
    const b = doc.createNode({ type: 'RECTANGLE', parentId: pageId });
    const groupId = doc.groupNodes([a, b]);
    doc.commitUndoGroup();
    doc.ungroupNodes(groupId);

    doc.undo();
    expect(doc.getNode(groupId)?.type).toBe('GROUP');
    expect(doc.getChildrenIds(groupId)).toEqual([a, b]);

    doc.redo();
    expect(doc.getNode(groupId)).toBeUndefined();
    expect(doc.getChildrenIds(pageId)).toEqual([a, b]);
  });
});

describe('variable collections, variables, and styles', () => {
  it('creates a collection with a single default mode', () => {
    const { doc } = newDocWithPage();
    const colId = doc.createVariableCollection('Theme', 'Light');
    const col = doc.getVariableCollections()[colId]!;
    expect(col.name).toBe('Theme');
    expect(col.modes).toHaveLength(1);
    expect(col.modes[0]!.name).toBe('Light');
    expect(col.defaultModeId).toBe(col.modes[0]!.id);
  });

  it('renames a collection and adds/renames modes', () => {
    const { doc } = newDocWithPage();
    const colId = doc.createVariableCollection('Theme', 'Light');
    doc.renameCollection(colId, 'Palette');
    const darkId = doc.addMode(colId, 'Dark');
    doc.renameMode(colId, darkId, 'Night');
    const col = doc.getVariableCollections()[colId]!;
    expect(col.name).toBe('Palette');
    expect(col.modes.map((m) => m.name)).toEqual(['Light', 'Night']);
  });

  it('removeMode guards the last mode and reassigns default when needed', () => {
    const { doc } = newDocWithPage();
    const colId = doc.createVariableCollection('Theme', 'Light');
    const lightId = doc.getVariableCollections()[colId]!.modes[0]!.id;
    expect(() => doc.removeMode(colId, lightId)).toThrow(/last mode/);

    const darkId = doc.addMode(colId, 'Dark');
    const varId = doc.createVariable(colId, 'COLOR', 'primary');
    // Removing the default (light) mode reassigns default and drops the value.
    doc.removeMode(colId, lightId);
    const col = doc.getVariableCollections()[colId]!;
    expect(col.modes.map((m) => m.id)).toEqual([darkId]);
    expect(col.defaultModeId).toBe(darkId);
    expect(lightId in doc.getVariables()[varId]!.valuesByMode).toBe(false);
  });

  it('creates variables seeded across all modes and updates per-mode values', () => {
    const { doc } = newDocWithPage();
    const colId = doc.createVariableCollection('Theme', 'Light');
    const darkId = doc.addMode(colId, 'Dark');
    const lightId = doc.getVariableCollections()[colId]!.modes[0]!.id;
    const varId = doc.createVariable(colId, 'COLOR', 'primary', '#ffffff');
    const v = doc.getVariables()[varId]!;
    expect(v.valuesByMode[lightId]).toBe('#ffffff');
    expect(v.valuesByMode[darkId]).toBe('#ffffff');

    doc.updateVariable(varId, { name: 'brand', valuesByMode: { [darkId]: '#000000' } });
    const updated = doc.getVariables()[varId]!;
    expect(updated.name).toBe('brand');
    expect(updated.valuesByMode[lightId]).toBe('#ffffff');
    expect(updated.valuesByMode[darkId]).toBe('#000000');
  });

  it('resolveVariableValue uses the active mode, then the collection default', () => {
    const { doc } = newDocWithPage();
    const colId = doc.createVariableCollection('Theme', 'Light');
    const lightId = doc.getVariableCollections()[colId]!.modes[0]!.id;
    const darkId = doc.addMode(colId, 'Dark');
    const varId = doc.createVariable(colId, 'COLOR', 'primary', '#111111');
    doc.updateVariable(varId, { valuesByMode: { [darkId]: '#eeeeee' } });

    expect(doc.resolveVariableValue(varId, darkId)).toBe('#eeeeee');
    expect(doc.resolveVariableValue(varId, lightId)).toBe('#111111');
    // Unknown mode falls back to the default (light) mode value.
    expect(doc.resolveVariableValue(varId, 'nope')).toBe('#111111');
    // Missing variable resolves to undefined.
    expect(doc.resolveVariableValue('missing')).toBeUndefined();
  });

  it('deleteCollection cascades to its variables but leaves others', () => {
    const { doc } = newDocWithPage();
    const colA = doc.createVariableCollection('A');
    const colB = doc.createVariableCollection('B');
    const a1 = doc.createVariable(colA, 'FLOAT', 'a1');
    const b1 = doc.createVariable(colB, 'FLOAT', 'b1');
    doc.deleteCollection(colA);
    expect(doc.getVariableCollections()[colA]).toBeUndefined();
    expect(doc.getVariables()[a1]).toBeUndefined();
    expect(doc.getVariables()[b1]?.name).toBe('b1');
  });

  it('variables and collections roundtrip through toJSON/fromJSON', () => {
    const { doc } = newDocWithPage();
    const colId = doc.createVariableCollection('Theme', 'Light');
    doc.createVariable(colId, 'COLOR', 'primary', '#3355ff');
    const json = doc.toJSON();
    expect(Object.keys(json.variableCollections)).toContain(colId);
    const restored = OpenDoc.fromJSON(json);
    expect(restored.toJSON()).toEqual(json);
  });

  it('undo reverts a variable creation as one group', () => {
    const { doc } = newDocWithPage();
    const colId = doc.createVariableCollection('Theme');
    doc.commitUndoGroup();
    const varId = doc.createVariable(colId, 'COLOR', 'primary');
    doc.commitUndoGroup();
    expect(doc.getVariables()[varId]).toBeDefined();
    doc.undo();
    expect(doc.getVariables()[varId]).toBeUndefined();
    expect(doc.getVariableCollections()[colId]).toBeDefined();
  });
});
