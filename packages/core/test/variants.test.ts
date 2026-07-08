import { describe, expect, it } from 'vitest';
import {
  OpenDoc,
  parseVariantName,
  variantMatrixOf,
  findVariant,
  variantPropsOf,
  resolveInstance,
} from '../src/index.js';

function newDocWithPage() {
  const doc = OpenDoc.create({ name: 'Test file' });
  const pageId = doc.getPages()[0]!;
  return { doc, pageId };
}

/** Create a COMPONENT under `parentId` with a given name/position. */
function component(
  doc: OpenDoc,
  parentId: string,
  name: string,
  x = 0,
  y = 0,
  width = 40,
  height = 40,
): string {
  const id = doc.createNode({ type: 'FRAME', parentId, name, x, y, width, height });
  doc.createComponentFromNode(id);
  return id;
}

describe('parseVariantName', () => {
  it('parses a single Prop=Value pair', () => {
    expect(parseVariantName('State=hover')).toEqual({
      props: { State: 'hover' },
      isDefault: false,
    });
  });

  it('parses multiple comma-separated pairs and trims whitespace', () => {
    expect(parseVariantName(' Size=lg , State=hover ')).toEqual({
      props: { Size: 'lg', State: 'hover' },
      isDefault: false,
    });
  });

  it('falls back to Variant=<name> when the name has no pair', () => {
    expect(parseVariantName('Primary Button')).toEqual({
      props: { Variant: 'Primary Button' },
      isDefault: true,
    });
  });

  it('keeps only pairs that have a key, ignoring bare tokens', () => {
    expect(parseVariantName('Size=lg, junk')).toEqual({
      props: { Size: 'lg' },
      isDefault: false,
    });
  });
});

describe('combineAsVariants', () => {
  it('creates a COMPONENT_SET containing the selected components', () => {
    const { doc, pageId } = newDocWithPage();
    const a = component(doc, pageId, 'State=default', 0, 0);
    const b = component(doc, pageId, 'State=hover', 60, 0);

    const setId = doc.combineAsVariants([a, b]);
    doc.commitUndoGroup();

    const set = doc.getNode(setId)!;
    expect(set.type).toBe('COMPONENT_SET');
    expect(doc.getChildrenIds(setId)).toEqual([a, b]);
    expect(doc.getParentId(a)).toBe(setId);
    expect(doc.getParentId(b)).toBe(setId);
    // The set no longer sits directly under the page; it replaces the members there.
    expect(doc.getChildrenIds(pageId)).toEqual([setId]);
  });

  it('assigns variantProperties parsed from each name', () => {
    const { doc, pageId } = newDocWithPage();
    const a = component(doc, pageId, 'Size=sm, State=default');
    const b = component(doc, pageId, 'Plain Name', 60, 0);

    doc.combineAsVariants([a, b]);
    doc.commitUndoGroup();

    const na = doc.getNode(a)!;
    const nb = doc.getNode(b)!;
    expect(na.type === 'COMPONENT' && na.variantProperties).toEqual({
      Size: 'sm',
      State: 'default',
    });
    expect(nb.type === 'COMPONENT' && nb.variantProperties).toEqual({ Variant: 'Plain Name' });
  });

  it('preserves each member on-screen position (world origin) after reparenting', () => {
    const { doc, pageId } = newDocWithPage();
    const a = component(doc, pageId, 'State=default', 10, 20);
    const b = component(doc, pageId, 'State=hover', 100, 20);

    const setId = doc.combineAsVariants([a, b]);
    doc.commitUndoGroup();

    // Set origin is the union top-left (10, 20); members become local to it.
    const set = doc.getNode(setId)!;
    expect({ x: set.x, y: set.y }).toEqual({ x: 10, y: 20 });
    expect({ x: doc.getNode(a)!.x, y: doc.getNode(a)!.y }).toEqual({ x: 0, y: 0 });
    expect({ x: doc.getNode(b)!.x, y: doc.getNode(b)!.y }).toEqual({ x: 90, y: 0 });
  });

  it('rejects a selection with fewer than two components', () => {
    const { doc, pageId } = newDocWithPage();
    const a = component(doc, pageId, 'State=default');
    expect(() => doc.combineAsVariants([a])).toThrow(/at least two/);
  });

  it('rejects non-component members', () => {
    const { doc, pageId } = newDocWithPage();
    const a = component(doc, pageId, 'State=default');
    const rect = doc.createNode({ type: 'RECTANGLE', parentId: pageId, x: 60, y: 0 });
    expect(() => doc.combineAsVariants([a, rect])).toThrow(/is not a component/);
  });

  it('is a single undo step that fully reverts', () => {
    const { doc, pageId } = newDocWithPage();
    const a = component(doc, pageId, 'State=default');
    const b = component(doc, pageId, 'State=hover', 60, 0);
    doc.commitUndoGroup(); // close the component-creation group

    const setId = doc.combineAsVariants([a, b]);
    doc.commitUndoGroup();
    expect(doc.getNode(setId)).toBeDefined();

    doc.undo();
    expect(doc.getNode(setId)).toBeUndefined();
    expect(doc.getParentId(a)).toBe(pageId);
    expect(doc.getParentId(b)).toBe(pageId);
    expect(doc.getChildrenIds(pageId)).toEqual([a, b]);
  });
});

describe('variantMatrixOf', () => {
  it('collects distinct values per property in first-seen order', () => {
    const { doc, pageId } = newDocWithPage();
    const a = component(doc, pageId, 'Size=sm, State=default');
    const b = component(doc, pageId, 'Size=lg, State=default', 60, 0);
    const c = component(doc, pageId, 'Size=sm, State=hover', 0, 60);

    const setId = doc.combineAsVariants([a, b, c]);
    doc.commitUndoGroup();

    expect(variantMatrixOf(doc, setId)).toEqual({
      Size: ['sm', 'lg'],
      State: ['default', 'hover'],
    });
  });

  it('throws for a non-set node', () => {
    const { doc, pageId } = newDocWithPage();
    expect(() => variantMatrixOf(doc, pageId)).toThrow(/is not a component set/);
  });
});

describe('findVariant', () => {
  it('returns the matching member id for the requested props', () => {
    const { doc, pageId } = newDocWithPage();
    const a = component(doc, pageId, 'Size=sm, State=default');
    const b = component(doc, pageId, 'Size=lg, State=default', 60, 0);
    const c = component(doc, pageId, 'Size=lg, State=hover', 0, 60);

    const setId = doc.combineAsVariants([a, b, c]);
    doc.commitUndoGroup();

    expect(findVariant(doc, setId, { Size: 'lg', State: 'hover' })).toBe(c);
    expect(findVariant(doc, setId, { Size: 'sm', State: 'default' })).toBe(a);
  });

  it('matches on a subset of props (first document-order match wins)', () => {
    const { doc, pageId } = newDocWithPage();
    const a = component(doc, pageId, 'Size=lg, State=default');
    const b = component(doc, pageId, 'Size=lg, State=hover', 60, 0);

    const setId = doc.combineAsVariants([a, b]);
    doc.commitUndoGroup();

    expect(findVariant(doc, setId, { Size: 'lg' })).toBe(a);
  });

  it('returns undefined when no member matches', () => {
    const { doc, pageId } = newDocWithPage();
    const a = component(doc, pageId, 'State=default');
    const b = component(doc, pageId, 'State=hover', 60, 0);

    const setId = doc.combineAsVariants([a, b]);
    doc.commitUndoGroup();

    expect(findVariant(doc, setId, { State: 'pressed' })).toBeUndefined();
  });
});

describe('variantPropsOf', () => {
  it('returns the properties of a component, empty for other node types', () => {
    const { doc, pageId } = newDocWithPage();
    const a = component(doc, pageId, 'Size=sm');
    doc.combineAsVariants([a, component(doc, pageId, 'Size=lg', 60, 0)]);
    doc.commitUndoGroup();
    expect(variantPropsOf(doc.getNode(a)!)).toEqual({ Size: 'sm' });

    const rect = doc.createNode({ type: 'RECTANGLE', parentId: pageId });
    expect(variantPropsOf(doc.getNode(rect)!)).toEqual({});
  });
});

describe('instance ↔ variant swap', () => {
  it('an instance can point at a variant and resolveInstance expands it', () => {
    const { doc, pageId } = newDocWithPage();
    const a = component(doc, pageId, 'State=default', 0, 0, 40, 40);
    const b = component(doc, pageId, 'State=hover', 60, 0, 40, 40);
    const setId = doc.combineAsVariants([a, b]);
    doc.commitUndoGroup();

    const instId = doc.createInstance(a, pageId, { x: 200, y: 200 });
    doc.commitUndoGroup();
    expect(resolveInstance(doc, instId).rootId).toBe(`${instId}:${a}`);

    // Swap to the hover variant found via the set matrix.
    const hover = findVariant(doc, setId, { State: 'hover' })!;
    doc.updateNode(instId, { componentId: hover });
    doc.commitUndoGroup();

    const inst = doc.getNode(instId)!;
    expect(inst.type === 'INSTANCE' && inst.componentId).toBe(hover);
    expect(resolveInstance(doc, instId).rootId).toBe(`${instId}:${hover}`);
  });
});
