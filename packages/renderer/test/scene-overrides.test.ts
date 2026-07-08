import { describe, expect, it } from 'vitest';
import { OpenDoc } from '@openmake/core';
import { buildRenderScene } from '../src/scene.js';

function newRect() {
  const doc = OpenDoc.create();
  const pageId = doc.getPages()[0]!;
  const rectId = doc.createNode({
    type: 'RECTANGLE',
    parentId: pageId,
    x: 10,
    y: 20,
    width: 100,
    height: 50,
    opacity: 1,
  });
  return { doc, pageId, rectId };
}

describe('buildRenderScene overrides', () => {
  it('leaves nodes untouched when no overrides are supplied', () => {
    const { doc, pageId, rectId } = newRect();
    const scene = buildRenderScene(doc, pageId);
    expect(scene.nodes[rectId]!.opacity).toBe(1);
    expect(scene.nodes[rectId]!.x).toBe(10);
  });

  it('merges per-node overrides on top of the persisted node for the frame', () => {
    const { doc, pageId, rectId } = newRect();
    const scene = buildRenderScene(doc, pageId, undefined, {
      [rectId]: { opacity: 0.25, x: 999 },
    });
    expect(scene.nodes[rectId]!.opacity).toBe(0.25);
    expect(scene.nodes[rectId]!.x).toBe(999);
    // The doc itself is never mutated by the override.
    expect(doc.getNode(rectId)!.opacity).toBe(1);
    expect(doc.getNode(rectId)!.x).toBe(10);
  });

  it('ignores overrides keyed to unrelated node ids', () => {
    const { doc, pageId, rectId } = newRect();
    const scene = buildRenderScene(doc, pageId, undefined, {
      'node-does-not-exist': { opacity: 0 },
    });
    expect(scene.nodes[rectId]!.opacity).toBe(1);
  });
});
