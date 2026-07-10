import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';
import { OpenDoc, replaceDocContent } from './index.js';

function withRect(name: string, rectName: string): OpenDoc {
  const doc = OpenDoc.create({ name });
  const page = doc.getPages()[0]!;
  doc.createNode({
    type: 'RECTANGLE',
    parentId: page,
    name: rectName,
    x: 0,
    y: 0,
    width: 10,
    height: 10,
  });
  return doc;
}

describe('replaceDocContent', () => {
  it('rewrites a doc so its contents equal the target (adds, removes, renames)', () => {
    const target = withRect('Target', 'KeepMe');
    const targetData = target.toJSON();

    // A different live doc: different name, a node the target does not have.
    const live = withRect('Live', 'GoneAfterRestore');
    expect(live.name).toBe('Live');
    const liveRectNames = Object.values(live.toJSON().nodes).map((n) => n.name);
    expect(liveRectNames).toContain('GoneAfterRestore');
    expect(liveRectNames).not.toContain('KeepMe');

    Y.transact(live.ydoc, () => replaceDocContent(live.ydoc, targetData));

    // Live now matches the target byte-for-byte at the document-model level:
    // adopted its meta (name/id/rootId), gained KeepMe, lost GoneAfterRestore.
    expect(live.toJSON()).toEqual(targetData);
    expect(live.name).toBe('Target');
    const afterNames = Object.values(live.toJSON().nodes).map((n) => n.name);
    expect(afterNames).toContain('KeepMe');
    expect(afterNames).not.toContain('GoneAfterRestore');
  });

  it('emits a single Yjs update for the whole rewrite (one undoable, appendable edit)', () => {
    const target = withRect('Target', 'KeepMe').toJSON();
    const live = withRect('Live', 'GoneAfterRestore');

    const updates: Uint8Array[] = [];
    live.ydoc.on('update', (u: Uint8Array) => updates.push(u));
    Y.transact(live.ydoc, () => replaceDocContent(live.ydoc, target));

    expect(updates).toHaveLength(1);
  });
});
