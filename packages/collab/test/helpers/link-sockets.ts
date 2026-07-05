import type { SocketLike } from '../../src/server.js';

type Listener = (data?: unknown) => void;

class FakeSocket implements SocketLike {
  private readonly listeners = new Map<string, Set<Listener>>();
  private peer: FakeSocket | null = null;
  closed = false;
  readonly sent: Uint8Array[] = [];

  _link(peer: FakeSocket): void {
    this.peer = peer;
  }

  send(data: Uint8Array): void {
    if (this.closed) return;
    this.sent.push(data);
    const peer = this.peer;
    if (!peer) return;
    // Async delivery so senders never observe synchronous re-entrancy.
    queueMicrotask(() => {
      if (peer.closed) return;
      peer.emit('message', data);
    });
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    queueMicrotask(() => this.emit('close'));
    const peer = this.peer;
    if (peer && !peer.closed) {
      queueMicrotask(() => peer.emit('close'));
    }
  }

  on(event: 'message' | 'close' | 'error', cb: Listener): void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(cb);
  }

  emit(event: string, data?: unknown): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const cb of set) cb(data);
  }
}

export type LinkedSocket = SocketLike & {
  sent: Uint8Array[];
  emit(event: string, data?: unknown): void;
};

/** Creates a pair of connected fake SocketLike endpoints for in-memory tests. */
export function linkSockets(): [LinkedSocket, LinkedSocket] {
  const a = new FakeSocket();
  const b = new FakeSocket();
  a._link(b);
  b._link(a);
  return [a, b];
}
