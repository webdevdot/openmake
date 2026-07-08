import type * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import { IndexeddbPersistence } from 'y-indexeddb';
import {
  MESSAGE_AWARENESS,
  MESSAGE_SYNC,
  createMessage,
  readMessageType,
  toBuffer,
  toDecoder,
} from './protocol.js';

export type ClientStatus = 'connecting' | 'connected' | 'disconnected';

type StatusListener = (status: ClientStatus) => void;
type SyncedListener = () => void;

const MIN_BACKOFF_MS = 500;
const MAX_BACKOFF_MS = 30_000;

export interface CollabClientOptions {
  /** Injectable WebSocket constructor, for tests or non-browser environments. */
  WebSocketImpl?: typeof WebSocket;
  /**
   * Appended as a `?token=` query param on the connection URL. Pass a
   * function to have it resolved fresh at every connect attempt (initial and
   * reconnects) — required when tokens are short-lived and would otherwise go
   * stale between reconnects.
   */
  token?: string | (() => string | Promise<string>);
  /** Connect immediately on construction. Defaults to true. */
  connect?: boolean;
}

/**
 * Client-side counterpart to DocSyncHub: maintains a WebSocket connection to
 * a doc room, keeps `ydoc` and `awareness` synced with the server, and
 * reconnects with exponential backoff on drops.
 */
export class CollabClient {
  readonly awareness: awarenessProtocol.Awareness;

  private readonly url: string;
  private readonly docId: string;
  private readonly ydoc: Y.Doc;
  private readonly WebSocketImpl: typeof WebSocket;
  private readonly token: string | (() => string | Promise<string>) | undefined;

  private ws: WebSocket | null = null;
  private status: ClientStatus = 'disconnected';
  private synced = false;
  private destroyed = false;
  private shouldConnect: boolean;
  private opening = false;
  private closeCode: number | null = null;
  private backoffMs = MIN_BACKOFF_MS;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  private readonly statusListeners = new Set<StatusListener>();
  private readonly syncedListeners = new Set<SyncedListener>();

  private readonly onDocUpdate: (update: Uint8Array, origin: unknown) => void;
  private readonly onAwarenessUpdate: (
    changes: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown,
  ) => void;

  constructor(url: string, docId: string, ydoc: Y.Doc, opts: CollabClientOptions = {}) {
    this.url = url;
    this.docId = docId;
    this.ydoc = ydoc;
    this.WebSocketImpl = opts.WebSocketImpl ?? (globalThis.WebSocket as typeof WebSocket);
    this.token = opts.token;
    this.shouldConnect = opts.connect ?? true;

    if (!this.WebSocketImpl) {
      throw new Error(
        'No WebSocket implementation available. Pass opts.WebSocketImpl in non-browser environments.',
      );
    }

    this.awareness = new awarenessProtocol.Awareness(ydoc);

    this.onDocUpdate = (update, origin) => {
      if (origin === this) return; // avoid echoing remote updates back out
      this.sendSyncUpdate(update);
    };
    this.ydoc.on('update', this.onDocUpdate);

    this.onAwarenessUpdate = (changes, origin) => {
      if (origin === this) return;
      const changed = [...changes.added, ...changes.updated, ...changes.removed];
      this.sendAwarenessUpdate(changed);
    };
    this.awareness.on('update', this.onAwarenessUpdate);

    if (this.shouldConnect) this.connect();
  }

  connect(): void {
    if (this.destroyed) return;
    this.shouldConnect = true;
    if (this.ws) return;
    this.openSocket();
  }

  disconnect(): void {
    this.shouldConnect = false;
    this.clearReconnectTimer();
    this.teardownSocket();
    this.setStatus('disconnected');
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.shouldConnect = false;
    this.clearReconnectTimer();
    this.teardownSocket();
    this.ydoc.off('update', this.onDocUpdate);
    this.awareness.off('update', this.onAwarenessUpdate);
    awarenessProtocol.removeAwarenessStates(this.awareness, [this.ydoc.clientID], this);
    this.statusListeners.clear();
    this.syncedListeners.clear();
  }

  setLocalState(state: Record<string, unknown> | null): void {
    this.awareness.setLocalState(state);
  }

  /**
   * Close code of the most recent socket close, or null before any close (or
   * when the transport didn't report one). Lets token providers detect
   * auth-shaped rejections (1008) and refresh before the next attempt.
   */
  get lastCloseCode(): number | null {
    return this.closeCode;
  }

  on(event: 'status', cb: StatusListener): () => void;
  on(event: 'synced', cb: SyncedListener): () => void;
  on(event: 'status' | 'synced', cb: StatusListener | SyncedListener): () => void {
    if (event === 'status') {
      const listener = cb as StatusListener;
      this.statusListeners.add(listener);
      return () => this.statusListeners.delete(listener);
    }
    const listener = cb as SyncedListener;
    this.syncedListeners.add(listener);
    return () => this.syncedListeners.delete(listener);
  }

  private openSocket(): void {
    if (this.ws || this.opening) return;
    this.opening = true;
    this.setStatus('connecting');
    // Resolve the token fresh for EVERY attempt (initial connect and each
    // reconnect) so short-lived credentials never go stale across retries.
    void Promise.resolve()
      .then(() => (typeof this.token === 'function' ? this.token() : this.token))
      .then(
        (token) => {
          this.opening = false;
          if (this.destroyed || !this.shouldConnect || this.ws) return;
          this.openSocketWithToken(token);
        },
        () => {
          // Token resolution failed: treat like a failed attempt and retry
          // with the usual backoff.
          this.opening = false;
          if (this.destroyed || !this.shouldConnect) return;
          this.setStatus('disconnected');
          this.scheduleReconnect();
        },
      );
  }

  private openSocketWithToken(token: string | undefined): void {
    const target = new URL(this.url);
    if (!target.pathname.endsWith('/')) target.pathname += '/';
    target.pathname += encodeURIComponent(this.docId);
    if (token) target.searchParams.set('token', token);

    const ws = new this.WebSocketImpl(target.toString());
    ws.binaryType = 'arraybuffer';
    this.ws = ws;
    this.synced = false;

    ws.addEventListener('open', () => {
      this.backoffMs = MIN_BACKOFF_MS;
      this.setStatus('connected');
      this.sendSyncStep1();
      this.sendFullAwareness();
    });

    ws.addEventListener('message', (event: MessageEvent) => {
      const data = this.toUint8Array(event.data);
      if (data) this.handleMessage(data);
    });

    ws.addEventListener('close', (event: CloseEvent) => {
      const code: unknown = (event as Partial<CloseEvent> | undefined)?.code;
      this.closeCode = typeof code === 'number' ? code : null;
      this.ws = null;
      awarenessProtocol.removeAwarenessStates(
        this.awareness,
        Array.from(this.awareness.getStates().keys()).filter((id) => id !== this.ydoc.clientID),
        this,
      );
      this.setStatus('disconnected');
      if (this.shouldConnect && !this.destroyed) this.scheduleReconnect();
    });

    ws.addEventListener('error', () => {
      // 'close' follows 'error' for browser/ws WebSocket implementations; no separate handling needed.
    });
  }

  private toUint8Array(data: unknown): Uint8Array | null {
    if (data instanceof ArrayBuffer) return new Uint8Array(data);
    if (data instanceof Uint8Array) return data;
    return null;
  }

  private handleMessage(data: Uint8Array): void {
    const decoder = toDecoder(data);
    const messageType = readMessageType(decoder);
    switch (messageType) {
      case MESSAGE_SYNC: {
        const encoder = createMessage(MESSAGE_SYNC);
        const wasSynced = this.synced;
        const replyType = syncProtocol.readSyncMessage(decoder, encoder, this.ydoc, this);
        if (encoding.length(encoder) > 1) this.send(toBuffer(encoder));
        if (!wasSynced && replyType === 1 /* messageYjsSyncStep2 */) {
          this.synced = true;
          for (const listener of this.syncedListeners) listener();
        }
        break;
      }
      case MESSAGE_AWARENESS: {
        awarenessProtocol.applyAwarenessUpdate(
          this.awareness,
          decoding.readVarUint8Array(decoder),
          this,
        );
        break;
      }
      default:
        break;
    }
  }

  private sendSyncStep1(): void {
    const encoder = createMessage(MESSAGE_SYNC);
    syncProtocol.writeSyncStep1(encoder, this.ydoc);
    this.send(toBuffer(encoder));
  }

  private sendSyncUpdate(update: Uint8Array): void {
    const encoder = createMessage(MESSAGE_SYNC);
    syncProtocol.writeUpdate(encoder, update);
    this.send(toBuffer(encoder));
  }

  private sendFullAwareness(): void {
    const states = this.awareness.getStates();
    if (states.size === 0) return;
    this.sendAwarenessUpdate(Array.from(states.keys()));
  }

  private sendAwarenessUpdate(clients: number[]): void {
    if (clients.length === 0) return;
    const encoder = createMessage(MESSAGE_AWARENESS);
    encoding.writeVarUint8Array(
      encoder,
      awarenessProtocol.encodeAwarenessUpdate(this.awareness, clients),
    );
    this.send(toBuffer(encoder));
  }

  private send(data: Uint8Array): void {
    if (this.ws && this.ws.readyState === this.WebSocketImpl.OPEN) {
      // Copy into a plain ArrayBuffer-backed view: lib0's Uint8Array is typed
      // as ArrayBufferLike (allows SharedArrayBuffer), which the DOM
      // WebSocket.send() overloads don't accept.
      this.ws.send(new Uint8Array(data));
    }
  }

  private scheduleReconnect(): void {
    this.clearReconnectTimer();
    const jitter = Math.random() * this.backoffMs * 0.25;
    const delay = Math.min(this.backoffMs, MAX_BACKOFF_MS) + jitter;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.backoffMs = Math.min(this.backoffMs * 2, MAX_BACKOFF_MS);
      if (this.shouldConnect && !this.destroyed) this.openSocket();
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private teardownSocket(): void {
    if (this.ws) {
      const ws = this.ws;
      this.ws = null;
      ws.close();
    }
  }

  private setStatus(status: ClientStatus): void {
    if (this.status === status) return;
    this.status = status;
    for (const listener of this.statusListeners) listener(status);
  }
}

export interface OfflinePersistenceHandle {
  whenSynced: Promise<unknown>;
  destroy: () => Promise<void>;
}

/**
 * Wraps y-indexeddb so callers don't need to depend on it directly. Throws
 * if called outside a browser-like environment (no global indexedDB).
 */
export function createOfflinePersistence(docId: string, ydoc: Y.Doc): OfflinePersistenceHandle {
  if (typeof indexedDB === 'undefined') {
    throw new Error(
      'createOfflinePersistence requires indexedDB, which is unavailable in this environment (e.g. Node).',
    );
  }
  const persistence = new IndexeddbPersistence(docId, ydoc);
  return {
    whenSynced: persistence.whenSynced,
    destroy: () => persistence.destroy(),
  };
}
