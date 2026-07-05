import type { DocSyncHub, SocketLike } from '../../src/server.js';

/**
 * A minimal WebSocket-shaped client that connects directly to a DocSyncHub
 * in-process (no real network), so CollabClient + DocSyncHub can be tested
 * together without spinning up an actual server.
 */
export function createHubBackedWebSocket(hub: DocSyncHub): typeof WebSocket {
  class FakeWebSocket {
    static readonly CONNECTING = 0;
    static readonly OPEN = 1;
    static readonly CLOSING = 2;
    static readonly CLOSED = 3;

    readonly CONNECTING = 0;
    readonly OPEN = 1;
    readonly CLOSING = 2;
    readonly CLOSED = 3;

    readyState = 0;
    binaryType = 'arraybuffer';
    url: string;

    private readonly listeners = new Map<string, Set<(ev: unknown) => void>>();
    private readonly serverListeners = new Map<string, Set<(data?: unknown) => void>>();
    private closed = false;

    constructor(url: string) {
      this.url = url;
      const docId = decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).pop() ?? '');

      // The "server-side" endpoint the hub is handed. Its send()/close() push
      // frames back to this fake client; its on() registers the callbacks
      // this fake client invokes when the "client" sends/closes.
      const serverSocket: SocketLike = {
        send: (data: Uint8Array) => {
          queueMicrotask(() => {
            if (this.closed) return;
            const copy = data.slice(); // detach from any pooled/reused buffer
            this.emit('message', { data: copy.buffer });
          });
        },
        close: () => this.doClose(),
        on: (event, cb) => {
          let set = this.serverListeners.get(event);
          if (!set) {
            set = new Set();
            this.serverListeners.set(event, set);
          }
          set.add(cb);
        },
      };

      // Mirror real transports: the socket is OPEN (and the 'open' event
      // fires) before any application-level handshake data is exchanged.
      // Only after that does the hub start pushing sync/awareness frames.
      queueMicrotask(() => {
        if (this.closed) return;
        this.readyState = this.OPEN;
        this.emit('open', {});
        void hub.handleConnection(serverSocket, docId);
      });
    }

    send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
      if (this.readyState !== this.OPEN) return;
      const buf =
        data instanceof ArrayBuffer
          ? new Uint8Array(data)
          : ArrayBuffer.isView(data)
            ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
            : new Uint8Array();
      queueMicrotask(() => {
        const set = this.serverListeners.get('message');
        if (set) for (const cb of set) cb(buf);
      });
    }

    close(): void {
      this.doClose();
    }

    private doClose(): void {
      if (this.closed) return;
      this.closed = true;
      this.readyState = this.CLOSED;
      queueMicrotask(() => {
        const set = this.serverListeners.get('close');
        if (set) for (const cb of set) cb();
        this.emit('close', {});
      });
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

    private emit(event: string, ev: unknown = {}): void {
      const set = this.listeners.get(event);
      if (!set) return;
      for (const cb of set) cb(ev);
    }
  }

  return FakeWebSocket as unknown as typeof WebSocket;
}
