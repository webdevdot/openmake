import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';
import { OpenDoc, replaceDocContent } from '@openmake/core';
import { DocSyncHub, type DocPersistence, type SocketLike } from './server.js';

/** Records every persistence call so tests can assert nothing is deleted/compacted. */
class RecordingPersistence implements DocPersistence {
  snapshot?: Uint8Array;
  updates: Uint8Array[] = [];
  snapshotCalls = 0;

  async load(): Promise<{ snapshot?: Uint8Array; updates: Uint8Array[] }> {
    return { snapshot: this.snapshot, updates: [...this.updates] };
  }
  async appendUpdate(_docId: string, update: Uint8Array): Promise<void> {
    this.updates.push(update);
  }
  async saveSnapshot(_docId: string, state: Uint8Array): Promise<void> {
    // Compaction: a real store would delete the folded updates here.
    this.snapshotCalls++;
    this.snapshot = state;
    this.updates = [];
  }
}

/** Minimal in-memory socket capturing outbound frames. */
function fakeSocket(): SocketLike & { sent: Uint8Array[] } {
  const handlers: Record<string, (data?: unknown) => void> = {};
  return {
    sent: [],
    send(data: Uint8Array) {
      (this as unknown as { sent: Uint8Array[] }).sent.push(data);
    },
    close() {},
    on(event: 'message' | 'close' | 'error', cb: (data?: unknown) => void) {
      handlers[event] = cb;
    },
  };
}

/** Encodes a doc's full state, plus a follow-up update that adds a second node. */
function seedHistory(): {
  snapshot: Uint8Array;
  forwardUpdate: Uint8Array;
  targetData: ReturnType<OpenDoc['toJSON']>;
} {
  // v1: a document with a single rectangle — this is the "version" we restore to.
  const v1 = OpenDoc.create({ name: 'design' });
  const page = v1.getPages()[0]!;
  v1.createNode({
    type: 'RECTANGLE',
    parentId: page,
    name: 'KeepMe',
    x: 0,
    y: 0,
    width: 10,
    height: 10,
  });
  const snapshot = Y.encodeStateAsUpdate(v1.ydoc);
  const targetData = v1.toJSON();

  // Move forward: a live doc adds an ellipse. Capture just that incremental update.
  const forward = new Y.Doc();
  Y.applyUpdate(forward, snapshot);
  const live = OpenDoc.fromYDoc(forward);
  let forwardUpdate: Uint8Array | undefined;
  forward.on('update', (u: Uint8Array) => (forwardUpdate = u));
  live.createNode({
    type: 'ELLIPSE',
    parentId: live.getPages()[0]!,
    name: 'AddedLater',
    x: 5,
    y: 5,
    width: 4,
    height: 4,
  });
  return { snapshot, forwardUpdate: forwardUpdate!, targetData };
}

describe('DocSyncHub.applyContentUpdate (non-destructive restore mechanic)', () => {
  it('appends exactly one new update, keeps the log intact, and reconstructs the target content', async () => {
    const { snapshot, forwardUpdate, targetData } = seedHistory();
    const persistence = new RecordingPersistence();
    persistence.snapshot = snapshot;
    persistence.updates = [forwardUpdate];

    const hub = new DocSyncHub(persistence);
    const docId = 'file-1';

    // Precondition: the live doc has BOTH nodes; log has the one forward update.
    const before = await hub.getDoc(docId);
    const beforeNames = Object.values(OpenDoc.fromYDoc(before).toJSON().nodes).map((n) => n.name);
    expect(beforeNames).toContain('KeepMe');
    expect(beforeNames).toContain('AddedLater');
    const updatesBefore = persistence.updates.length;

    // Restore to v1 (rect only) as a new appended update.
    await hub.applyContentUpdate(docId, (ydoc) => replaceDocContent(ydoc, targetData));

    // Exactly one NEW update appended; NOTHING compacted/deleted.
    expect(persistence.updates.length).toBe(updatesBefore + 1);
    expect(persistence.snapshotCalls).toBe(0);

    // A fresh load from the (intact) log yields the target content: no ellipse.
    const reloaded = new Y.Doc();
    Y.applyUpdate(reloaded, persistence.snapshot!);
    for (const u of persistence.updates) Y.applyUpdate(reloaded, u);
    const names = Object.values(OpenDoc.fromYDoc(reloaded).toJSON().nodes).map((n) => n.name);
    expect(names).toContain('KeepMe');
    expect(names).not.toContain('AddedLater');
  });

  it('broadcasts the restore update to connected peers', async () => {
    const { snapshot, forwardUpdate, targetData } = seedHistory();
    const persistence = new RecordingPersistence();
    persistence.snapshot = snapshot;
    persistence.updates = [forwardUpdate];

    const hub = new DocSyncHub(persistence);
    const docId = 'file-2';
    const socket = fakeSocket();
    await hub.handleConnection(socket, docId);
    const sentAfterHandshake = socket.sent.length;

    await hub.applyContentUpdate(docId, (ydoc) => replaceDocContent(ydoc, targetData));

    // The peer received at least one additional frame (the restore update).
    expect(socket.sent.length).toBeGreaterThan(sentAfterHandshake);
  });
});
