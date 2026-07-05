import { describe, expect, it, vi } from 'vitest';
import { OpenDoc } from '@openmake/core';
import { applyLayoutPatches } from './apply-layout-patches.js';

function makeDocWithFrame() {
  const doc = OpenDoc.create();
  const pageId = doc.getPages()[0]!;
  const frameId = doc.createNode({ type: 'FRAME', parentId: pageId, x: 0, y: 0, width: 100, height: 100 });
  return { doc, frameId };
}

describe('applyLayoutPatches', () => {
  it('applies a patch that changes geometry', () => {
    const { doc, frameId } = makeDocWithFrame();
    const patches = new Map([[frameId, { x: 50 }]]);
    applyLayoutPatches(doc, patches);
    expect(doc.getNode(frameId)?.x).toBe(50);
  });

  it('skips a patch that is identical to current geometry (no-op guard)', () => {
    const { doc, frameId } = makeDocWithFrame();
    const updateSpy = vi.spyOn(doc, 'updateNode');
    const patches = new Map([[frameId, { x: 0, y: 0, width: 100, height: 100 }]]);
    applyLayoutPatches(doc, patches);
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('applies only the changed nodes when multiple patches are mixed', () => {
    const { doc, frameId } = makeDocWithFrame();
    const pageId = doc.getPages()[0]!;
    const otherId = doc.createNode({ type: 'RECTANGLE', parentId: pageId, x: 0, y: 0, width: 10, height: 10 });
    const updateSpy = vi.spyOn(doc, 'updateNode');
    const patches = new Map([
      [frameId, { x: 0, y: 0, width: 100, height: 100 }], // no-op
      [otherId, { x: 5 }], // real change
    ]);
    applyLayoutPatches(doc, patches);
    expect(updateSpy).toHaveBeenCalledTimes(1);
    expect(updateSpy).toHaveBeenCalledWith(otherId, { x: 5 });
  });

  it('ignores patches for nodes that no longer exist', () => {
    const { doc } = makeDocWithFrame();
    const patches = new Map([['missing-id', { x: 5 }]]);
    expect(() => applyLayoutPatches(doc, patches)).not.toThrow();
  });
});
