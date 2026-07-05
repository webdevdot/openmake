import { useEffect, useRef } from 'react';
import type { CollabClient } from '@openmake/collab/client';
import { useAuthStore } from '../store/auth.js';
import { useSelectionStore } from '../store/selection.js';
import { usePresenceStore, type RemoteAwarenessState } from '../store/presence.js';
import { presenceColorForUserId } from '../lib/presence-color.js';

const CURSOR_THROTTLE_MS = 50;

/**
 * Publishes local cursor/selection to awareness (throttled) and mirrors
 * remote awareness states into the presence store for rendering.
 */
export function useAwareness(client: CollabClient | null): {
  onPointerMoveWorld: (world: { x: number; y: number }) => void;
} {
  const user = useAuthStore((s) => s.user);
  const lastSent = useRef(0);

  useEffect(() => {
    if (!client || !user) return;
    client.setLocalState({
      userId: user.id,
      name: user.name,
      color: presenceColorForUserId(user.id),
      selection: useSelectionStore.getState().selectedIds,
    });

    const unsubscribeSelection = useSelectionStore.subscribe((state) => {
      client.setLocalState({
        userId: user.id,
        name: user.name,
        color: presenceColorForUserId(user.id),
        selection: state.selectedIds,
      });
    });

    const syncRemoteStates = () => {
      const states: Record<string, RemoteAwarenessState> = {};
      for (const [clientId, state] of client.awareness.getStates()) {
        if (clientId === client.awareness.doc?.clientID) continue;
        const s = state as Partial<RemoteAwarenessState> | undefined;
        if (!s?.userId) continue;
        states[s.userId] = {
          userId: s.userId,
          name: s.name ?? 'Anonymous',
          color: s.color ?? presenceColorForUserId(s.userId),
          cursor: s.cursor,
          selection: s.selection,
        };
      }
      usePresenceStore.getState().setStates(states);
    };

    client.awareness.on('change', syncRemoteStates);
    syncRemoteStates();

    return () => {
      unsubscribeSelection();
      client.awareness.off('change', syncRemoteStates);
    };
  }, [client, user]);

  const onPointerMoveWorld = (world: { x: number; y: number }) => {
    if (!client || !user) return;
    const now = performance.now();
    if (now - lastSent.current < CURSOR_THROTTLE_MS) return;
    lastSent.current = now;
    client.setLocalState({
      userId: user.id,
      name: user.name,
      color: presenceColorForUserId(user.id),
      cursor: world,
      selection: useSelectionStore.getState().selectedIds,
    });
  };

  return { onPointerMoveWorld };
}
