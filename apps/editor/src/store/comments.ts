import { create } from 'zustand';
import { commentsApi } from '../api/endpoints.js';
import type { Comment } from '../api/types.js';

/**
 * Comments are SERVER data, not part of the collaborative Y.Doc: they are
 * fetched on file open and mutated through the REST API with optimistic local
 * updates. Live push (other users' comments appearing in real time) is a
 * follow-up — v1 reflects only this client's mutations until the next load.
 */
interface CommentsState {
  fileId: string | null;
  /** Top-level threads (each carries its own `replies`), oldest first. */
  threads: Comment[];
  loading: boolean;
  error: string | null;
  showResolved: boolean;
  /** The thread whose popover is open, if any. */
  activeThreadId: string | null;
  /** A not-yet-created pin being composed at this world-space point. */
  draftPin: { x: number; y: number } | null;

  load: (fileId: string) => Promise<void>;
  reset: () => void;
  setShowResolved: (value: boolean) => void;
  openThread: (id: string | null) => void;
  startDraft: (point: { x: number; y: number }) => void;
  cancelDraft: () => void;
  /** Create a top-level thread at the current draft pin. No-op without a draft. */
  createThread: (body: string) => Promise<void>;
  reply: (parentId: string, body: string) => Promise<void>;
  setResolved: (id: string, resolved: boolean) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

/** Normalize a thread returned by the API so `replies` is always an array. */
function withReplies(thread: Comment): Comment {
  return { ...thread, replies: thread.replies ?? [] };
}

export const useCommentsStore = create<CommentsState>((set, get) => ({
  fileId: null,
  threads: [],
  loading: false,
  error: null,
  showResolved: false,
  activeThreadId: null,
  draftPin: null,

  load: async (fileId) => {
    set({ fileId, loading: true, error: null });
    try {
      const comments = await commentsApi.list(fileId);
      // Ignore a stale response if the user switched files mid-flight.
      if (get().fileId !== fileId) return;
      set({ threads: comments.map(withReplies), loading: false });
    } catch (err) {
      if (get().fileId !== fileId) return;
      set({
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to load comments',
      });
    }
  },

  reset: () =>
    set({
      fileId: null,
      threads: [],
      loading: false,
      error: null,
      activeThreadId: null,
      draftPin: null,
    }),

  setShowResolved: (value) => set({ showResolved: value }),

  openThread: (id) => set({ activeThreadId: id, draftPin: null }),

  startDraft: (point) => set({ draftPin: point, activeThreadId: null }),

  cancelDraft: () => set({ draftPin: null }),

  createThread: async (body) => {
    const { fileId, draftPin } = get();
    const trimmed = body.trim();
    if (!fileId || !draftPin || !trimmed) return;
    const comment = await commentsApi.create(fileId, {
      body: trimmed,
      anchorX: draftPin.x,
      anchorY: draftPin.y,
    });
    set((s) => ({
      threads: [...s.threads, withReplies(comment)],
      draftPin: null,
      activeThreadId: comment.id,
    }));
  },

  reply: async (parentId, body) => {
    const { fileId } = get();
    const trimmed = body.trim();
    if (!fileId || !trimmed) return;
    const reply = await commentsApi.create(fileId, { body: trimmed, parentId });
    set((s) => ({
      threads: s.threads.map((t) =>
        t.id === parentId ? { ...t, replies: [...(t.replies ?? []), reply] } : t,
      ),
    }));
  },

  setResolved: async (id, resolved) => {
    const { fileId } = get();
    if (!fileId) return;
    const updated = await commentsApi.setResolved(fileId, id, resolved);
    set((s) => ({
      threads: s.threads.map((t) => (t.id === id ? { ...t, resolvedAt: updated.resolvedAt } : t)),
    }));
  },

  remove: async (id) => {
    const { fileId } = get();
    if (!fileId) return;
    await commentsApi.delete(fileId, id);
    set((s) => ({
      // Drop a top-level thread, or a reply nested in one.
      threads: s.threads
        .filter((t) => t.id !== id)
        .map((t) => ({ ...t, replies: (t.replies ?? []).filter((r) => r.id !== id) })),
      activeThreadId: s.activeThreadId === id ? null : s.activeThreadId,
    }));
  },
}));
