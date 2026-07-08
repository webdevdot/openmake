import { useEffect, useState } from 'react';
import * as Y from 'yjs';
import { OpenDoc } from '@openmake/core';
import { createCanvasKitRenderer, buildRenderScene } from '@openmake/renderer';
import { buildVariableColors } from '../store/variables.js';
import { filesApi } from '../api/endpoints.js';

/** Longest-side target (CSS px) for a generated thumbnail. */
export const THUMBNAIL_MAX_SIDE = 320;

/** Maximum thumbnail generations allowed to run concurrently. */
export const THUMBNAIL_CONCURRENCY = 3;

export type ThumbnailStatus = 'pending' | 'ready' | 'error';

export interface ThumbnailState {
  status: ThumbnailStatus;
  /** Object URL for the rendered PNG; only set when `status === 'ready'`. */
  url: string | null;
}

interface CacheEntry {
  /** The updatedAt this entry was rendered for — a newer value invalidates it. */
  updatedAt: string;
  url: string | null;
  status: ThumbnailStatus;
  /** In-flight generation, deduped so concurrent callers share one render. */
  promise: Promise<string | null> | null;
}

/**
 * Module-level cache keyed by fileId. Survives component unmounts (so scrolling
 * the dashboard doesn't re-render every card) and is only invalidated when a
 * file's `updatedAt` changes. Object URLs are revoked when replaced.
 */
const cache = new Map<string, CacheEntry>();

// Simple FIFO concurrency gate: at most THUMBNAIL_CONCURRENCY renders in flight.
let active = 0;
const queue: Array<() => void> = [];

function acquireSlot(): Promise<void> {
  if (active < THUMBNAIL_CONCURRENCY) {
    active += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    queue.push(() => {
      active += 1;
      resolve();
    });
  });
}

function releaseSlot(): void {
  active -= 1;
  const next = queue.shift();
  if (next) next();
}

/**
 * Fetch a file's snapshot, hydrate an OpenDoc, and render its first page to a
 * small PNG object URL. Exported for testing; UI code goes through the hook.
 */
export async function generateThumbnail(fileId: string): Promise<string | null> {
  await acquireSlot();
  let renderer: Awaited<ReturnType<typeof createCanvasKitRenderer>> | null = null;
  try {
    const bytes = await filesApi.snapshot(fileId);
    const ydoc = new Y.Doc();
    Y.applyUpdate(ydoc, bytes);
    const doc = OpenDoc.fromYDoc(ydoc);

    const firstPage = doc.getPages()[0];
    if (!firstPage) return null;

    renderer = await createCanvasKitRenderer({ surface: 'offscreen' });
    const scene = buildRenderScene(doc, firstPage, {}, {}, buildVariableColors(doc));

    // Fit the longest side to THUMBNAIL_MAX_SIDE (never upscale).
    const sceneW = Math.max(
      1,
      ...scene.rootIds.map((id) => {
        const n = scene.nodes[id];
        return n ? n.x + n.width : 0;
      }),
    );
    const sceneH = Math.max(
      1,
      ...scene.rootIds.map((id) => {
        const n = scene.nodes[id];
        return n ? n.y + n.height : 0;
      }),
    );
    const scale = Math.min(1, THUMBNAIL_MAX_SIDE / Math.max(sceneW, sceneH));

    const png = await renderer.exportPNG(scene, { scale });
    // Copy into a fresh ArrayBuffer so Blob doesn't retain the whole Yjs buffer.
    const blob = new Blob([png.slice()], { type: 'image/png' });
    return URL.createObjectURL(blob);
  } finally {
    renderer?.dispose();
    releaseSlot();
  }
}

/**
 * Returns a cached, lazily generated thumbnail for a file. Re-renders only when
 * `updatedAt` changes. On any error (network, render) it resolves to a null url
 * with `status: 'error'` so callers can fall back to a blank card.
 */
export function useFileThumbnail(fileId: string, updatedAt: string): ThumbnailState {
  const [state, setState] = useState<ThumbnailState>(() => {
    const entry = cache.get(fileId);
    if (entry && entry.updatedAt === updatedAt && entry.status === 'ready') {
      return { status: 'ready', url: entry.url };
    }
    return { status: 'pending', url: null };
  });

  useEffect(() => {
    let cancelled = false;
    const existing = cache.get(fileId);

    // Cache hit for this exact updatedAt: reuse without re-rendering.
    if (existing && existing.updatedAt === updatedAt && existing.status !== 'error') {
      if (existing.status === 'ready') {
        setState({ status: 'ready', url: existing.url });
        return;
      }
      if (existing.promise) {
        setState({ status: 'pending', url: null });
        void existing.promise.then((url) => {
          if (!cancelled) {
            setState(url ? { status: 'ready', url } : { status: 'error', url: null });
          }
        });
        return;
      }
    }

    // Stale entry (older updatedAt): revoke its URL before regenerating.
    if (existing && existing.updatedAt !== updatedAt && existing.url) {
      URL.revokeObjectURL(existing.url);
    }

    setState({ status: 'pending', url: null });
    const promise = generateThumbnail(fileId);
    cache.set(fileId, { updatedAt, url: null, status: 'pending', promise });

    void promise
      .then((url) => {
        const entry = cache.get(fileId);
        // Only commit if this is still the newest request for the file.
        if (entry && entry.promise === promise) {
          cache.set(fileId, {
            updatedAt,
            url,
            status: url ? 'ready' : 'error',
            promise: null,
          });
        } else if (url) {
          // A newer request superseded us — drop our orphaned URL.
          URL.revokeObjectURL(url);
        }
        if (!cancelled) {
          setState(url ? { status: 'ready', url } : { status: 'error', url: null });
        }
      })
      .catch(() => {
        const entry = cache.get(fileId);
        if (entry && entry.promise === promise) {
          cache.set(fileId, { updatedAt, url: null, status: 'error', promise: null });
        }
        if (!cancelled) setState({ status: 'error', url: null });
      });

    return () => {
      cancelled = true;
    };
  }, [fileId, updatedAt]);

  return state;
}

/** Test-only: clears the module cache (revoking any live object URLs). */
export function __resetThumbnailCache(): void {
  for (const entry of cache.values()) {
    if (entry.url) URL.revokeObjectURL(entry.url);
  }
  cache.clear();
  active = 0;
  queue.length = 0;
}
