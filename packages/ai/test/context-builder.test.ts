import { OpenDoc } from '@openmake/core';
import { describe, expect, it } from 'vitest';
import { buildDesignContext } from '../src/context-builder.js';

function setUpDoc() {
  const doc = OpenDoc.create({ name: 'Test file' });
  const pageId = doc.getPages()[0]!;

  doc.setVariable({
    id: 'var_color',
    name: 'brand/primary',
    type: 'COLOR',
    valuesByMode: { default: { r: 1, g: 0, b: 0, a: 1 } },
  });
  doc.setVariable({
    id: 'var_unused',
    name: 'unused/token',
    type: 'COLOR',
    valuesByMode: { default: { r: 0, g: 0, b: 0, a: 1 } },
  });

  const frameId = doc.createNode({ type: 'FRAME', parentId: pageId, name: 'Card' });
  const textId = doc.createNode({
    type: 'TEXT',
    parentId: frameId,
    name: 'Label',
    boundVariables: { 'fills.0.color': 'var_color' },
  });
  const rectId = doc.createNode({ type: 'RECTANGLE', parentId: frameId, name: 'Swatch' });

  const componentId = doc.createComponentFromNode(
    doc.createNode({ type: 'FRAME', parentId: pageId, name: 'Button', width: 120, height: 40 }),
  );
  doc.updateNode(componentId, { description: 'Primary button' });
  const buttonLabelId = doc.createNode({ type: 'TEXT', parentId: componentId, name: 'ButtonLabel' });

  const instanceId = doc.createInstance(componentId, pageId, { x: 200, y: 200 });

  return { doc, pageId, frameId, textId, rectId, componentId, buttonLabelId, instanceId };
}

describe('buildDesignContext', () => {
  it('returns document metadata and one selection entry per requested id', () => {
    const { doc, frameId } = setUpDoc();
    const ctx = buildDesignContext(doc, [frameId]);
    expect(ctx.document).toEqual({ id: doc.id, name: doc.name });
    expect(ctx.selection).toHaveLength(1);
    expect(ctx.selection[0]!.node.id).toBe(frameId);
  });

  it('builds the ancestor path root -> parent, excluding the node itself', () => {
    const { doc, pageId, frameId, textId } = setUpDoc();
    const ctx = buildDesignContext(doc, [textId]);
    const path = ctx.selection[0]!.path;
    expect(path.map((p) => p.id)).toEqual([doc.rootId, pageId, frameId]);
    expect(path.some((p) => p.id === textId)).toBe(false);
  });

  it('flattens descendants and records childrenOrder', () => {
    const { doc, frameId, textId, rectId } = setUpDoc();
    const ctx = buildDesignContext(doc, [frameId]);
    const { descendants, childrenOrder } = ctx.selection[0]!;
    expect(Object.keys(descendants).sort()).toEqual([textId, rectId].sort());
    expect(childrenOrder[frameId]).toEqual([textId, rectId]);
  });

  it('only includes variables actually referenced within the selection subtree', () => {
    const { doc, frameId } = setUpDoc();
    const ctx = buildDesignContext(doc, [frameId]);
    expect(Object.keys(ctx.variables)).toEqual(['var_color']);
    expect(ctx.variables['var_color']?.name).toBe('brand/primary');
  });

  it('populates component info for a COMPONENT node', () => {
    const { doc, componentId } = setUpDoc();
    const ctx = buildDesignContext(doc, [componentId]);
    expect(ctx.selection[0]!.component).toMatchObject({
      id: componentId,
      name: 'Button',
      description: 'Primary button',
    });
  });

  it('resolves an INSTANCE into a synthetic subtree and populates component info from the source component', () => {
    const { doc, instanceId, componentId, buttonLabelId } = setUpDoc();
    const ctx = buildDesignContext(doc, [instanceId]);
    const selected = ctx.selection[0]!;

    expect(selected.component).toMatchObject({ id: componentId, name: 'Button' });

    const syntheticChildId = `${instanceId}:${buttonLabelId}`;
    expect(selected.descendants[syntheticChildId]).toBeDefined();
    expect(selected.descendants[syntheticChildId]!.name).toBe('ButtonLabel');
  });

  it('respects maxDepth, still recording childrenOrder at the cutoff without descending further', () => {
    const doc = OpenDoc.create({ name: 'Deep' });
    const pageId = doc.getPages()[0]!;
    let parentId = doc.createNode({ type: 'FRAME', parentId: pageId, name: 'L0' });
    const rootId = parentId;
    const chain: string[] = [rootId];
    for (let i = 1; i <= 5; i++) {
      parentId = doc.createNode({ type: 'FRAME', parentId, name: `L${i}` });
      chain.push(parentId);
    }

    const ctx = buildDesignContext(doc, [rootId], { maxDepth: 2 });
    const { descendants } = ctx.selection[0]!;

    // depth 1 (chain[1]) and depth 2 (chain[2]) are included; depth 3+ is not.
    expect(descendants[chain[1]!]).toBeDefined();
    expect(descendants[chain[2]!]).toBeDefined();
    expect(descendants[chain[3]!]).toBeUndefined();
  });
});
