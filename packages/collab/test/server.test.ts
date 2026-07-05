import { describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { OpenDoc } from '@openmake/core';
import { DocSyncHub, MemoryPersistence } from '../src/server.js';
import { linkSockets } from './helpers/link-sockets.js';

async function waitFor(assertion: () => void, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  for (;;) {
    try {
      assertion();
      return;
    } catch (err) {
      if (Date.now() - start > timeoutMs) throw err;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  }
}

describe('DocSyncHub', () => {
  it('late joiner receives pre-existing nodes via initial sync', async () => {
    const persistence = new MemoryPersistence();
    const hub = new DocSyncHub(persistence);
    const docId = 'doc-1';

    // Seed the hub's doc before any client connects.
    const hubDoc = await hub.getDoc(docId);
    const seed = OpenDoc.create({ name: 'seed doc' });
    Y.applyUpdate(hubDoc, Y.encodeStateAsUpdate(seed.ydoc));
    const openDoc = OpenDoc.fromYDoc(hubDoc);
    const pageId = openDoc.getPages()[0]!;
    openDoc.createNode({ type: 'RECTANGLE', parentId: pageId, name: 'seed' });

    const { CollabClient } = await import('../src/client.js');
    const { createHubBackedWebSocket } = await import('./helpers/fake-websocket.js');
    const WebSocketImpl = createHubBackedWebSocket(hub);

    const clientYDoc = new Y.Doc();
    const client = new CollabClient('ws://test/rooms', docId, clientYDoc, {
      WebSocketImpl,
      connect: false,
    });
    const synced = new Promise<void>((resolve) => client.on('synced', () => resolve()));
    client.connect();
    await synced;

    const clientOpenDoc = OpenDoc.fromYDoc(clientYDoc);
    await waitFor(() => {
      expect(clientOpenDoc.getChildrenIds(clientOpenDoc.getPages()[0]!)).toHaveLength(1);
    });
    const nodes = Object.values(clientOpenDoc.toJSON().nodes).filter((n) => n.type === 'RECTANGLE');
    expect(nodes).toHaveLength(1);

    client.destroy();
    await hub.destroy();
  });

  it('two clients converge both directions and awareness propagates', async () => {
    const persistence = new MemoryPersistence();
    const hub = new DocSyncHub(persistence);
    const docId = 'doc-converge';

    const { CollabClient } = await import('../src/client.js');
    const { createHubBackedWebSocket } = await import('./helpers/fake-websocket.js');
    const WebSocketImpl = createHubBackedWebSocket(hub);

    const openA = OpenDoc.create({ name: 'shared doc' });
    const ydocA = openA.ydoc;
    const ydocB = new Y.Doc();
    const a = new CollabClient('ws://test/rooms', docId, ydocA, { WebSocketImpl, connect: false });
    const b = new CollabClient('ws://test/rooms', docId, ydocB, { WebSocketImpl, connect: false });

    const aSynced = new Promise<void>((resolve) => a.on('synced', () => resolve()));
    const bSynced = new Promise<void>((resolve) => b.on('synced', () => resolve()));
    a.connect();
    b.connect();
    await aSynced;
    await bSynced;

    const openB = OpenDoc.fromYDoc(ydocB);
    const pageA = openA.getPages()[0]!;

    await waitFor(() => {
      expect(openB.getPages()).toHaveLength(1);
    });
    const pageB = openB.getPages()[0]!;

    openA.createNode({ type: 'RECTANGLE', parentId: pageA, name: 'from-a' });
    openB.createNode({ type: 'ELLIPSE', parentId: pageB, name: 'from-b' });

    await waitFor(() => {
      expect(openA.getChildrenIds(pageA)).toHaveLength(2);
      expect(openB.getChildrenIds(pageB)).toHaveLength(2);
    });

    // Awareness: A sets a cursor, B should observe it.
    a.setLocalState({ cursor: { x: 1, y: 2 } });
    await waitFor(() => {
      const states = [...b.awareness.getStates().values()];
      expect(states.some((s) => (s as { cursor?: unknown }).cursor)).toBe(true);
    });

    // A disconnects -> B should see it removed from awareness.
    const aClientId = ydocA.clientID;
    a.destroy();
    await waitFor(() => {
      expect(b.awareness.getStates().has(aClientId)).toBe(false);
    });

    b.destroy();
    await hub.destroy();
  });

  it('MemoryPersistence accumulates updates and a fresh hub reconstructs the doc', async () => {
    const persistence = new MemoryPersistence();
    const hub1 = new DocSyncHub(persistence);
    const docId = 'doc-persist';

    const hubDoc1 = await hub1.getDoc(docId);
    const seed = OpenDoc.create({ name: 'seed doc' });
    Y.applyUpdate(hubDoc1, Y.encodeStateAsUpdate(seed.ydoc));
    const open1 = OpenDoc.fromYDoc(hubDoc1);
    const page1 = open1.getPages()[0]!;
    open1.createNode({ type: 'RECTANGLE', parentId: page1, name: 'persisted' });

    await waitFor(async () => {
      const { updates } = await persistence.load(docId);
      expect(updates.length).toBeGreaterThan(0);
    });

    await hub1.closeDoc(docId);

    const hub2 = new DocSyncHub(persistence);
    const hubDoc2 = await hub2.getDoc(docId);
    const open2 = OpenDoc.fromYDoc(hubDoc2);
    const nodes = Object.values(open2.toJSON().nodes).filter((n) => n.type === 'RECTANGLE');
    expect(nodes).toHaveLength(1);
    await hub2.destroy();
  });

  it('compacts into a snapshot once compactAfterUpdates is exceeded', async () => {
    const saveSnapshot = vi.fn().mockResolvedValue(undefined);
    const persistence = new MemoryPersistence();
    persistence.saveSnapshot = saveSnapshot;
    const hub = new DocSyncHub(persistence, { compactAfterUpdates: 3 });
    const docId = 'doc-compact';

    const hubDoc = await hub.getDoc(docId);
    const seed = OpenDoc.create({ name: 'seed doc' });
    Y.applyUpdate(hubDoc, Y.encodeStateAsUpdate(seed.ydoc));
    const open = OpenDoc.fromYDoc(hubDoc);
    const page = open.getPages()[0]!;

    // Each createNode causes one Yjs update. Fire 4 to exceed the threshold of 3.
    for (let i = 0; i < 4; i++) {
      open.createNode({ type: 'RECTANGLE', parentId: page, name: `r${i}` });
    }

    await waitFor(() => {
      expect(saveSnapshot).toHaveBeenCalled();
    });
    const [, state] = saveSnapshot.mock.calls[0]!;
    expect(state).toBeInstanceOf(Uint8Array);

    await hub.destroy();
  });

  it('broadcasts updates to other sockets but excludes the sender', async () => {
    const persistence = new MemoryPersistence();
    const hub = new DocSyncHub(persistence);
    const docId = 'doc-broadcast';

    const syncProtocol = await import('y-protocols/sync');
    const { MESSAGE_SYNC, createMessage, toBuffer } = await import('../src/protocol.js');

    const [, aServer] = linkSockets();
    const [, bServer] = linkSockets();
    // Spy on the server-side ends: those are the SocketLike instances the
    // hub actually calls send()/close() on.
    const aSendSpy = vi.spyOn(aServer, 'send');
    const bSendSpy = vi.spyOn(bServer, 'send');

    await hub.handleConnection(aServer, docId);
    await hub.handleConnection(bServer, docId);
    aSendSpy.mockClear();
    bSendSpy.mockClear();

    // Send an update as if it came from client A's socket. Must carry real
    // content — an update from a brand-new empty Y.Doc encodes to an empty
    // diff and would never trigger the hub's ydoc 'update' handler.
    const aOpenDoc = OpenDoc.create({ name: 'broadcast doc' });
    const update = Y.encodeStateAsUpdate(aOpenDoc.ydoc);
    const encoder = createMessage(MESSAGE_SYNC);
    syncProtocol.writeUpdate(encoder, update);
    aServer.emit('message', toBuffer(encoder));

    await waitFor(() => {
      expect(bSendSpy).toHaveBeenCalled();
    });
    // The sender's own socket must not receive the broadcast of its own update.
    expect(aSendSpy).not.toHaveBeenCalled();

    expect(hub.connectionCount(docId)).toBe(2);
    await hub.destroy();
  });
});
