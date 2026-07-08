import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import {
  MESSAGE_AWARENESS,
  MESSAGE_SYNC,
  createMessage,
  readMessageType,
  toBuffer,
  toDecoder,
} from './protocol.js';

/** Minimal transport abstraction so DocSyncHub doesn't depend on a specific WS library. */
export interface SocketLike {
  send(data: Uint8Array): void;
  close(): void;
  on(event: 'message' | 'close' | 'error', cb: (data?: unknown) => void): void;
}

export interface DocPersistence {
  load(docId: string): Promise<{ snapshot?: Uint8Array; updates: Uint8Array[] }>;
  appendUpdate(docId: string, update: Uint8Array): Promise<void>;
  /** Called with the full encoded state (Y.encodeStateAsUpdate) when a compaction threshold is reached. */
  saveSnapshot?(docId: string, state: Uint8Array, updateCount: number): Promise<void>;
}

interface SocketEntry {
  clientIds: Set<number>;
  /** Read-only clients receive updates + awareness but may not mutate the doc. */
  readOnly: boolean;
}

interface Room {
  ydoc: Y.Doc;
  awareness: awarenessProtocol.Awareness;
  sockets: Map<SocketLike, SocketEntry>;
  updateCount: number;
  onUpdate: (update: Uint8Array, origin: unknown) => void;
  onAwarenessUpdate: (
    changes: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown,
  ) => void;
}

const DEFAULT_COMPACT_AFTER_UPDATES = 200;
/** Reject inbound frames larger than this (DoS guard). 4 MiB comfortably fits real doc updates. */
const DEFAULT_MAX_MESSAGE_BYTES = 4 * 1024 * 1024;

/**
 * Transport-agnostic sync hub: one room per docId, holding the canonical
 * server-side Y.Doc + Awareness for that doc and the sockets currently
 * connected to it.
 */
export class DocSyncHub {
  private readonly persistence: DocPersistence;
  private readonly compactAfterUpdates: number;
  private readonly maxMessageBytes: number;
  private readonly rooms = new Map<string, Room>();
  private readonly loading = new Map<string, Promise<Room>>();

  constructor(
    persistence: DocPersistence,
    opts: { compactAfterUpdates?: number; maxMessageBytes?: number } = {},
  ) {
    this.persistence = persistence;
    this.compactAfterUpdates = opts.compactAfterUpdates ?? DEFAULT_COMPACT_AFTER_UPDATES;
    this.maxMessageBytes = opts.maxMessageBytes ?? DEFAULT_MAX_MESSAGE_BYTES;
  }

  async getDoc(docId: string): Promise<Y.Doc> {
    const room = await this.getRoom(docId);
    return room.ydoc;
  }

  connectionCount(docId: string): number {
    return this.rooms.get(docId)?.sockets.size ?? 0;
  }

  async handleConnection(
    socket: SocketLike,
    docId: string,
    opts: { readOnly?: boolean } = {},
  ): Promise<void> {
    const room = await this.getRoom(docId);
    const readOnly = opts.readOnly ?? false;
    room.sockets.set(socket, { clientIds: new Set(), readOnly });

    // Bidirectional sync: greet the new peer with our state and ask for theirs.
    const syncStep2 = createMessage(MESSAGE_SYNC);
    syncProtocol.writeSyncStep2(syncStep2, room.ydoc);
    socket.send(toBuffer(syncStep2));

    const syncStep1 = createMessage(MESSAGE_SYNC);
    syncProtocol.writeSyncStep1(syncStep1, room.ydoc);
    socket.send(toBuffer(syncStep1));

    const states = room.awareness.getStates();
    if (states.size > 0) {
      const encoder = createMessage(MESSAGE_AWARENESS);
      encoding.writeVarUint8Array(
        encoder,
        awarenessProtocol.encodeAwarenessUpdate(room.awareness, Array.from(states.keys())),
      );
      socket.send(toBuffer(encoder));
    }

    socket.on('message', (data?: unknown) => {
      const buf = this.toUint8Array(data);
      if (!buf) return;
      if (buf.byteLength > this.maxMessageBytes) {
        // Oversized frame — drop it rather than apply/persist unbounded data.
        return;
      }
      this.handleMessage(room, socket, buf, readOnly);
    });

    socket.on('close', () => {
      this.handleClose(docId, room, socket);
    });

    socket.on('error', () => {
      this.handleClose(docId, room, socket);
    });
  }

  async closeDoc(docId: string): Promise<void> {
    const room = this.rooms.get(docId);
    if (!room) return;
    for (const socket of room.sockets.keys()) socket.close();
    await this.flush(docId, room);
    this.teardownRoom(room);
    this.rooms.delete(docId);
  }

  async destroy(): Promise<void> {
    await Promise.all(Array.from(this.rooms.keys()).map((docId) => this.closeDoc(docId)));
  }

  private async getRoom(docId: string): Promise<Room> {
    const existing = this.rooms.get(docId);
    if (existing) return existing;

    const inFlight = this.loading.get(docId);
    if (inFlight) return inFlight;

    const promise = this.loadRoom(docId);
    this.loading.set(docId, promise);
    try {
      const room = await promise;
      this.rooms.set(docId, room);
      return room;
    } finally {
      this.loading.delete(docId);
    }
  }

  private async loadRoom(docId: string): Promise<Room> {
    const { snapshot, updates } = await this.persistence.load(docId);
    const ydoc = new Y.Doc();
    Y.transact(ydoc, () => {
      if (snapshot) Y.applyUpdate(ydoc, snapshot);
      for (const update of updates) Y.applyUpdate(ydoc, update);
    });

    const awareness = new awarenessProtocol.Awareness(ydoc);
    // The hub itself has no cursor; avoid emitting a spurious awareness entry.
    awareness.setLocalState(null);

    const room: Room = {
      ydoc,
      awareness,
      sockets: new Map(),
      updateCount: 0,
      onUpdate: () => {},
      onAwarenessUpdate: () => {},
    };

    room.onUpdate = (update: Uint8Array, origin: unknown) => {
      this.broadcastUpdate(room, update, origin);
      void this.persistUpdate(docId, room, update);
    };
    ydoc.on('update', room.onUpdate);

    room.onAwarenessUpdate = (changes, origin) => {
      const changed = [...changes.added, ...changes.updated, ...changes.removed];
      if (changed.length === 0) return;
      // Track which client ids a given socket introduced, so we can clean
      // them up (removeAwarenessStates) when that socket disconnects.
      const entry = room.sockets.get(origin as SocketLike);
      if (entry) {
        for (const clientId of [...changes.added, ...changes.updated])
          entry.clientIds.add(clientId);
        for (const clientId of changes.removed) entry.clientIds.delete(clientId);
      }
      this.broadcastAwareness(room, changed, origin);
    };
    awareness.on('update', room.onAwarenessUpdate);

    return room;
  }

  private handleMessage(room: Room, socket: SocketLike, data: Uint8Array, readOnly: boolean): void {
    const decoder = toDecoder(data);
    const messageType = readMessageType(decoder);
    switch (messageType) {
      case MESSAGE_SYNC: {
        if (readOnly) {
          // Serve reads (SyncStep1 → SyncStep2) but never apply the client's
          // writes (SyncStep2 / Update) to the canonical doc.
          const syncMessageType = decoding.readVarUint(decoder);
          if (syncMessageType === syncProtocol.messageYjsSyncStep1) {
            const encoder = createMessage(MESSAGE_SYNC);
            syncProtocol.writeSyncStep2(encoder, room.ydoc);
            socket.send(toBuffer(encoder));
          }
          // messageYjsSyncStep2 / messageYjsUpdate from a read-only client: dropped.
          break;
        }
        const encoder = createMessage(MESSAGE_SYNC);
        syncProtocol.readSyncMessage(decoder, encoder, room.ydoc, socket);
        if (encoding.length(encoder) > 1) socket.send(toBuffer(encoder));
        break;
      }
      case MESSAGE_AWARENESS: {
        // Awareness (cursors/presence) is allowed for read-only clients.
        const update = decoding.readVarUint8Array(decoder);
        awarenessProtocol.applyAwarenessUpdate(room.awareness, update, socket);
        break;
      }
      default:
        break;
    }
  }

  private handleClose(docId: string, room: Room, socket: SocketLike): void {
    const entry = room.sockets.get(socket);
    room.sockets.delete(socket);
    if (entry && entry.clientIds.size > 0) {
      awarenessProtocol.removeAwarenessStates(room.awareness, Array.from(entry.clientIds), socket);
    }
    if (room.sockets.size === 0) {
      void this.closeDoc(docId);
    }
  }

  private broadcastUpdate(room: Room, update: Uint8Array, origin: unknown): void {
    const encoder = createMessage(MESSAGE_SYNC);
    syncProtocol.writeUpdate(encoder, update);
    const buf = toBuffer(encoder);
    for (const socket of room.sockets.keys()) {
      if (socket === origin) continue;
      socket.send(buf);
    }
  }

  private broadcastAwareness(room: Room, clients: number[], origin: unknown): void {
    const encoder = createMessage(MESSAGE_AWARENESS);
    encoding.writeVarUint8Array(
      encoder,
      awarenessProtocol.encodeAwarenessUpdate(room.awareness, clients),
    );
    const buf = toBuffer(encoder);
    for (const socket of room.sockets.keys()) {
      if (socket === origin) continue;
      socket.send(buf);
    }
  }

  private async persistUpdate(docId: string, room: Room, update: Uint8Array): Promise<void> {
    await this.persistence.appendUpdate(docId, update);
    room.updateCount++;
    if (room.updateCount > this.compactAfterUpdates && this.persistence.saveSnapshot) {
      const state = Y.encodeStateAsUpdate(room.ydoc);
      const count = room.updateCount;
      room.updateCount = 0;
      await this.persistence.saveSnapshot(docId, state, count);
    }
  }

  private async flush(docId: string, room: Room): Promise<void> {
    if (room.updateCount > 0 && this.persistence.saveSnapshot) {
      const state = Y.encodeStateAsUpdate(room.ydoc);
      const count = room.updateCount;
      room.updateCount = 0;
      await this.persistence.saveSnapshot(docId, state, count);
    }
  }

  private teardownRoom(room: Room): void {
    room.ydoc.off('update', room.onUpdate);
    room.awareness.off('update', room.onAwarenessUpdate);
    room.awareness.destroy();
    room.ydoc.destroy();
  }

  private toUint8Array(data: unknown): Uint8Array | null {
    if (data instanceof Uint8Array) return data;
    if (data instanceof ArrayBuffer) return new Uint8Array(data);
    return null;
  }
}

/** In-memory DocPersistence — for tests and local dev. Not durable across process restarts. */
export class MemoryPersistence implements DocPersistence {
  private readonly docs = new Map<string, { snapshot?: Uint8Array; updates: Uint8Array[] }>();

  async load(docId: string): Promise<{ snapshot?: Uint8Array; updates: Uint8Array[] }> {
    const entry = this.docs.get(docId);
    if (!entry) return { updates: [] };
    return { snapshot: entry.snapshot, updates: [...entry.updates] };
  }

  async appendUpdate(docId: string, update: Uint8Array): Promise<void> {
    const entry = this.docs.get(docId) ?? { updates: [] };
    entry.updates.push(update);
    this.docs.set(docId, entry);
  }

  async saveSnapshot(docId: string, state: Uint8Array, _updateCount: number): Promise<void> {
    this.docs.set(docId, { snapshot: state, updates: [] });
  }
}
