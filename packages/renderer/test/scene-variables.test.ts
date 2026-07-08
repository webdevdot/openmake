import { describe, expect, it } from 'vitest';
import { OpenDoc } from '@openmake/core';
import type { Paint } from '@openmake/shared';
import { buildRenderScene } from '../src/scene.js';

function newBoundRect() {
  const doc = OpenDoc.create();
  const pageId = doc.getPages()[0]!;
  const colId = doc.createVariableCollection('Theme', 'Light');
  const varId = doc.createVariable(colId, 'COLOR', 'primary', '#ff0000');
  const rectId = doc.createNode({
    type: 'RECTANGLE',
    parentId: pageId,
    width: 100,
    height: 50,
    fills: [
      {
        type: 'SOLID',
        color: { r: 0, g: 0, b: 0, a: 0.5 },
        opacity: 1,
        visible: true,
        boundVariableId: varId,
      },
    ],
  });
  return { doc, pageId, rectId, varId };
}

const solidFill = (doc: OpenDoc, id: string): Extract<Paint, { type: 'SOLID' }> => {
  const node = doc.getNode(id) as { fills: Paint[] };
  const fill = node.fills[0]!;
  if (fill.type !== 'SOLID') throw new Error('expected solid');
  return fill;
};

describe('buildRenderScene variable-bound fills', () => {
  it('resolves a bound solid fill to the variable color for the active mode', () => {
    const { doc, pageId, rectId, varId } = newBoundRect();
    const scene = buildRenderScene(doc, pageId, undefined, {}, { [varId]: '#00ff00' });
    const fill = (scene.nodes[rectId] as { fills: Paint[] }).fills[0]!;
    expect(fill.type === 'SOLID' && fill.color).toEqual({ r: 0, g: 1, b: 0, a: 0.5 });
  });

  it('preserves the stored alpha channel when resolving', () => {
    const { doc, pageId, rectId, varId } = newBoundRect();
    const scene = buildRenderScene(doc, pageId, undefined, {}, { [varId]: '#ffffff' });
    const fill = (scene.nodes[rectId] as { fills: Paint[] }).fills[0]!;
    expect(fill.type === 'SOLID' && fill.color.a).toBe(0.5);
  });

  it('falls back to the stored color when the variable is unresolved', () => {
    const { doc, pageId, rectId } = newBoundRect();
    const scene = buildRenderScene(doc, pageId); // no variableColors
    const fill = (scene.nodes[rectId] as { fills: Paint[] }).fills[0]!;
    expect(fill.type === 'SOLID' && fill.color).toEqual({ r: 0, g: 0, b: 0, a: 0.5 });
  });

  it('never mutates the underlying document', () => {
    const { doc, pageId, rectId, varId } = newBoundRect();
    buildRenderScene(doc, pageId, undefined, {}, { [varId]: '#00ff00' });
    expect(solidFill(doc, rectId).color).toEqual({ r: 0, g: 0, b: 0, a: 0.5 });
  });

  it('leaves unbound solid fills alone', () => {
    const doc = OpenDoc.create();
    const pageId = doc.getPages()[0]!;
    const rectId = doc.createNode({
      type: 'RECTANGLE',
      parentId: pageId,
      width: 10,
      height: 10,
      fills: [{ type: 'SOLID', color: { r: 0.2, g: 0.2, b: 0.2, a: 1 }, opacity: 1, visible: true }],
    });
    const scene = buildRenderScene(doc, pageId, undefined, {}, { any: '#ffffff' });
    const fill = (scene.nodes[rectId] as { fills: Paint[] }).fills[0]!;
    expect(fill.type === 'SOLID' && fill.color).toEqual({ r: 0.2, g: 0.2, b: 0.2, a: 1 });
  });
});
