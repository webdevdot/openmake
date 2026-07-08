import { afterEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { OpenDoc } from '@openmake/core';
import { CollabClient } from '../src/client.js';
import { DocSyncHub, MemoryPersistence } from '../src/server.js';
import { createHubBackedWebSocket } from './helpers/fake-websocket.js';

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

describe('CollabClient', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('emits connecting -> connected status and fires synced after first SyncStep2', async () => {
    const hub = new DocSyncHub(new MemoryPersistence());
    const WebSocketImpl = createHubBackedWebSocket(hub);
    const ydoc = new Y.Doc();

    const statuses: string[] = [];
    const client = new CollabClient('ws://test/rooms', 'doc-status', ydoc, {
      WebSocketImpl,
      connect: false,
    });
    client.on('status', (s) => statuses.push(s));

    let synced = false;
    client.on('synced', () => {
      synced = true;
    });
    client.connect();

    await waitFor(() => {
      expect(synced).toBe(true);
    });
    expect(statuses).toContain('connecting');
    expect(statuses).toContain('connected');

    client.destroy();
    await hub.destroy();
  });

  it('does not auto-connect when opts.connect is false', async () => {
    const hub = new DocSyncHub(new MemoryPersistence());
    const WebSocketImpl = createHubBackedWebSocket(hub);
    const ydoc = new Y.Doc();

    const statuses: string[] = [];
    const client = new CollabClient('ws://test/rooms', 'doc-manual', ydoc, {
      WebSocketImpl,
      connect: false,
    });
    client.on('status', (s) => statuses.push(s));

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(statuses).toEqual([]);

    client.connect();
    let synced = false;
    client.on('synced', () => {
      synced = true;
    });
    await waitFor(() => expect(synced).toBe(true));

    client.destroy();
    await hub.destroy();
  });

  it('setLocalState propagates to a remote peer awareness', async () => {
    const hub = new DocSyncHub(new MemoryPersistence());
    const WebSocketImpl = createHubBackedWebSocket(hub);
    const docId = 'doc-awareness';

    const a = new CollabClient('ws://test/rooms', docId, new Y.Doc(), {
      WebSocketImpl,
      connect: false,
    });
    const b = new CollabClient('ws://test/rooms', docId, new Y.Doc(), {
      WebSocketImpl,
      connect: false,
    });
    const aSynced = new Promise<void>((resolve) => a.on('synced', () => resolve()));
    const bSynced = new Promise<void>((resolve) => b.on('synced', () => resolve()));
    a.connect();
    b.connect();
    await aSynced;
    await bSynced;

    a.setLocalState({ cursor: { x: 5, y: 9 }, name: 'Ada' });

    await waitFor(() => {
      const found = [...b.awareness.getStates().values()].find(
        (s) => (s as { name?: string }).name === 'Ada',
      );
      expect(found).toMatchObject({ cursor: { x: 5, y: 9 } });
    });

    a.destroy();
    b.destroy();
    await hub.destroy();
  });

  it('destroy() removes the local client from remote awareness', async () => {
    const hub = new DocSyncHub(new MemoryPersistence());
    const WebSocketImpl = createHubBackedWebSocket(hub);
    const docId = 'doc-leave';

    const aYDoc = new Y.Doc();
    const a = new CollabClient('ws://test/rooms', docId, aYDoc, { WebSocketImpl, connect: false });
    const b = new CollabClient('ws://test/rooms', docId, new Y.Doc(), {
      WebSocketImpl,
      connect: false,
    });
    const aSynced = new Promise<void>((resolve) => a.on('synced', () => resolve()));
    const bSynced = new Promise<void>((resolve) => b.on('synced', () => resolve()));
    a.connect();
    b.connect();
    await aSynced;
    await bSynced;

    a.setLocalState({ cursor: { x: 1, y: 1 } });
    await waitFor(() => {
      expect(b.awareness.getStates().has(aYDoc.clientID)).toBe(true);
    });

    a.destroy();
    await waitFor(() => {
      expect(b.awareness.getStates().has(aYDoc.clientID)).toBe(false);
    });

    b.destroy();
    await hub.destroy();
  });

  it('resolves a function token before every connect attempt and puts it in the URL', async () => {
    // Only fake the timers the client's backoff uses; microtasks stay real so
    // the token promise and socket events still flush with plain awaits.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const flushMicrotasks = async (): Promise<void> => {
      for (let i = 0; i < 10; i += 1) await Promise.resolve();
    };

    const urls: string[] = [];
    const sockets: RecordingSocket[] = [];

    class RecordingSocket {
      static readonly CONNECTING = 0;
      static readonly OPEN = 1;
      static readonly CLOSING = 2;
      static readonly CLOSED = 3;

      readyState = 0;
      binaryType = 'arraybuffer';
      url: string;

      private readonly listeners = new Map<string, Set<(ev: unknown) => void>>();

      constructor(url: string) {
        this.url = url;
        urls.push(url);
        sockets.push(this);
        queueMicrotask(() => {
          if (this.readyState !== RecordingSocket.CLOSED) {
            this.readyState = RecordingSocket.OPEN;
            this.emit('open', {});
          }
        });
      }

      send(): void {}

      close(): void {
        this.serverClose();
      }

      /** Simulates the server dropping the connection (optionally with a close code). */
      serverClose(code?: number): void {
        if (this.readyState === RecordingSocket.CLOSED) return;
        this.readyState = RecordingSocket.CLOSED;
        queueMicrotask(() => this.emit('close', code === undefined ? {} : { code }));
      }

      addEventListener(event: string, cb: (ev: unknown) => void): void {
        let set = this.listeners.get(event);
        if (!set) {
          set = new Set();
          this.listeners.set(event, set);
        }
        set.add(cb);
      }

      removeEventListener(event: string, cb: (ev: unknown) => void): void {
        this.listeners.get(event)?.delete(cb);
      }

      private emit(event: string, ev: unknown): void {
        const set = this.listeners.get(event);
        if (!set) return;
        for (const cb of set) cb(ev);
      }
    }

    const tokenFn = vi.fn(async () => `tok-${tokenFn.mock.calls.length}`);
    const client = new CollabClient('ws://test/rooms', 'doc-token', new Y.Doc(), {
      WebSocketImpl: RecordingSocket as unknown as typeof WebSocket,
      token: tokenFn,
      connect: false,
    });

    try {
      // Initial connect resolves the token and puts it on the URL.
      client.connect();
      await flushMicrotasks();
      expect(tokenFn).toHaveBeenCalledTimes(1);
      expect(urls).toHaveLength(1);
      expect(new URL(urls[0]!).searchParams.get('token')).toBe('tok-1');

      // Server drops the connection: the reconnect attempt must call the
      // token function again and use the NEW value, not the stale one.
      sockets[0]!.serverClose(1008);
      await flushMicrotasks();
      expect(client.lastCloseCode).toBe(1008);
      await vi.advanceTimersByTimeAsync(1000); // first backoff: 500ms + jitter
      await flushMicrotasks();
      expect(tokenFn).toHaveBeenCalledTimes(2);
      expect(urls).toHaveLength(2);
      expect(new URL(urls[1]!).searchParams.get('token')).toBe('tok-2');

      // A second drop reconnects with yet another freshly resolved token.
      sockets[1]!.serverClose();
      await flushMicrotasks();
      expect(client.lastCloseCode).toBeNull();
      await vi.advanceTimersByTimeAsync(2000); // second backoff: 1000ms + jitter
      await flushMicrotasks();
      expect(tokenFn).toHaveBeenCalledTimes(3);
      expect(urls).toHaveLength(3);
      expect(new URL(urls[2]!).searchParams.get('token')).toBe('tok-3');
    } finally {
      client.destroy();
    }
  });

  it('two clients converge in both directions through the hub', async () => {
    const hub = new DocSyncHub(new MemoryPersistence());
    const WebSocketImpl = createHubBackedWebSocket(hub);
    const docId = 'doc-converge-client';

    const openA = OpenDoc.create({ name: 'shared doc' });
    const ydocB = new Y.Doc();
    const a = new CollabClient('ws://test/rooms', docId, openA.ydoc, {
      WebSocketImpl,
      connect: false,
    });
    const b = new CollabClient('ws://test/rooms', docId, ydocB, { WebSocketImpl, connect: false });
    const aSynced = new Promise<void>((resolve) => a.on('synced', () => resolve()));
    const bSynced = new Promise<void>((resolve) => b.on('synced', () => resolve()));
    a.connect();
    b.connect();
    await aSynced;
    await bSynced;

    const openB = OpenDoc.fromYDoc(ydocB);
    await waitFor(() => {
      expect(openB.getPages()).toHaveLength(1);
    });
    openA.createNode({ type: 'RECTANGLE', parentId: openA.getPages()[0]!, name: 'from-a' });
    openB.createNode({ type: 'ELLIPSE', parentId: openB.getPages()[0]!, name: 'from-b' });

    await waitFor(() => {
      expect(openA.getChildrenIds(openA.getPages()[0]!)).toHaveLength(2);
      expect(openB.getChildrenIds(openB.getPages()[0]!)).toHaveLength(2);
    });
    expect(openA.toJSON()).toEqual(openB.toJSON());

    a.destroy();
    b.destroy();
    await hub.destroy();
  });
});

describe('createOfflinePersistence', () => {
  it('throws a clear error when indexedDB is unavailable (Node)', async () => {
    const { createOfflinePersistence } = await import('../src/client.js');
    expect(() => createOfflinePersistence('doc-offline', new Y.Doc())).toThrow(/indexedDB/i);
  });
});
