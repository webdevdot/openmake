import { useEffect, useRef, useState } from 'react';
import * as Y from 'yjs';
import { OpenDoc } from '@openmake/core';
import { CollabClient, createOfflinePersistence, type ClientStatus } from '@openmake/collab/client';
import { useAuthStore } from '../store/auth.js';

export type CollabStatus = 'connecting' | 'connected' | 'offline';

export interface CollabSession {
  doc: OpenDoc;
  client: CollabClient;
  status: CollabStatus;
}

const WS_BASE = (import.meta.env.VITE_API_URL ?? 'http://localhost:8080').replace(/^http/, 'ws');

/**
 * Mounts one OpenDoc + CollabClient + offline persistence per fileId.
 * Constructs the client with connect:false, wires 'status'/'synced'
 * listeners, THEN calls .connect() per @openmake/collab's documented race.
 */
export function useCollab(fileId: string): CollabSession | null {
  const accessToken = useAuthStore((s) => s.accessToken);
  const [session, setSession] = useState<CollabSession | null>(null);
  const [status, setStatus] = useState<CollabStatus>('connecting');
  const sessionRef = useRef<CollabSession | null>(null);

  useEffect(() => {
    let cancelled = false;
    const ydoc = new Y.Doc();
    const doc = OpenDoc.fromYDoc(ydoc);

    let offline: { destroy: () => Promise<void> } | null = null;
    try {
      offline = createOfflinePersistence(fileId, ydoc);
    } catch {
      // Non-browser or IndexedDB unavailable: proceed online-only.
    }

    const client = new CollabClient(`${WS_BASE}/sync`, fileId, ydoc, {
      token: accessToken ?? undefined,
      connect: false,
    });

    const unsubStatus = client.on('status', (s: ClientStatus) => {
      if (cancelled) return;
      setStatus(s === 'connected' ? 'connected' : s === 'connecting' ? 'connecting' : 'offline');
    });
    const unsubSynced = client.on('synced', () => {
      if (cancelled) return;
      setStatus('connected');
    });

    client.connect();

    const next: CollabSession = { doc, client, status: 'connecting' };
    sessionRef.current = next;
    if (!cancelled) setSession(next);

    return () => {
      cancelled = true;
      unsubStatus();
      unsubSynced();
      client.destroy();
      void offline?.destroy();
    };
    // fileId identity change should tear down and rebuild the whole session;
    // accessToken is captured at connect time intentionally (reconnects use the client's own backoff).
  }, [fileId]);

  if (!session) return null;
  return { ...session, status };
}
