import { useEffect, useRef } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { getWorldBounds } from '@openmake/core';
import type { CollabSession } from './useCollab.js';
import { useDocVersion } from './document.js';
import { useSelectionStore } from '../store/selection.js';
import { useCameraStore } from '../store/camera.js';
import { fitBounds } from '../canvas/camera.js';
import { slugify } from '../lib/slug.js';

const NODE_PARAM = 'node-id';
const PAGE_PARAM = 'page';
const SYNC_DEBOUNCE_MS = 300;

/** Measured canvas viewport (screen px) used to frame a deep-linked node. */
export interface Viewport {
  width: number;
  height: number;
}

export interface UseUrlSyncArgs {
  session: CollabSession | null;
  /** Currently active page id (owned by EditorPage). */
  activePageId: string | null;
  /** Activate a page (EditorPage's `setActivePageId`). */
  setActivePageId: (id: string) => void;
  /**
   * Returns the live canvas viewport in screen px. Called lazily when a
   * `?node-id` deep link is applied so the node can be framed. Falls back to
   * the window when omitted (e.g. in hook tests without a real canvas).
   */
  getViewport?: () => Viewport;
}

function readViewport(getViewport?: () => Viewport): Viewport {
  if (getViewport) return getViewport();
  return {
    width: typeof window === 'undefined' ? 1280 : window.innerWidth,
    height: typeof window === 'undefined' ? 720 : window.innerHeight,
  };
}

/**
 * Owns ALL URL <-> editor-state synchronization for the file route
 * (`/file/:fileId/:slug?`). Called once from EditorPage. Split into three
 * concerns, each gated on the doc actually having content (via `docVersion`),
 * so a cold navigation to a deep link works once the collab session syncs:
 *
 *  - Slug canonicalization: rewrite the URL to include a kebab-case slug of the
 *    file name (replace, no remount — same route object).
 *  - `?node-id=<id>`: on first sync, select + zoom-to-fit the node if it exists;
 *    thereafter keep the param in sync with the (single) selection, debounced.
 *  - `?page=<id>`: on first sync, activate that page (falling back to the first
 *    page silently if invalid); thereafter mirror page switches into the param.
 *
 * All writes use `navigate(..., { replace: true })` so browser history stays
 * clean and back/forward is never polluted by canonicalization or selection.
 */
export function useUrlSync({
  session,
  activePageId,
  setActivePageId,
  getViewport,
}: UseUrlSyncArgs): void {
  const { fileId, slug } = useParams<{ fileId: string; slug?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const doc = session?.doc ?? null;
  const docVersion = useDocVersion(doc);
  // The doc is "ready" once its first page exists (content synced). Pages only
  // appear after the first collab sync message for an existing file.
  const ready = doc != null && doc.getPages().length > 0;

  // Latest values captured for use inside effects/callbacks without widening
  // their dependency arrays (which would re-run the one-shot deep-link logic).
  const locationRef = useRef(location);
  locationRef.current = location;
  const searchParamsRef = useRef(searchParams);
  searchParamsRef.current = searchParams;
  const activePageIdRef = useRef(activePageId);
  activePageIdRef.current = activePageId;

  // Guards so the mount-read deep-link logic (node-id + page) runs exactly once
  // per file, after the doc has content — not on every version bump.
  const deepLinkAppliedRef = useRef(false);
  // The page id already reflected in the URL. Seeded from the mount-read so the
  // R3 write only fires on a genuine user switch, not the initial activation.
  const syncedPageRef = useRef<string | null>(null);

  // Reset the one-shot guards whenever the file changes (route param identity).
  useEffect(() => {
    deepLinkAppliedRef.current = false;
    syncedPageRef.current = null;
  }, [fileId]);

  // --- R1: slug canonicalization -------------------------------------------
  useEffect(() => {
    if (!ready || !doc || !fileId) return;
    const wanted = slugify(doc.name);
    if (slug === wanted) return;
    // Preserve the query string; only the slug path segment changes.
    const search = locationRef.current.search;
    navigate(`/file/${fileId}/${wanted}${search}`, { replace: true });
  }, [ready, doc, fileId, slug, navigate, docVersion]);

  // --- R2 + R3 (mount read): apply ?node-id and ?page once synced -----------
  useEffect(() => {
    if (!ready || !doc || deepLinkAppliedRef.current) return;
    deepLinkAppliedRef.current = true;
    const params = searchParamsRef.current;

    // R3: page param → activate (invalid falls back to the first page silently).
    // Seed the synced-page baseline so the R3 write effect stays quiet until the
    // user actually switches pages (the initial activation is not a "switch").
    const pageParam = params.get(PAGE_PARAM);
    if (pageParam && doc.getPages().includes(pageParam)) {
      setActivePageId(pageParam);
      syncedPageRef.current = pageParam;
    } else {
      syncedPageRef.current = activePageIdRef.current;
    }

    // R2: node-id param → select + zoom-to-fit if the node exists.
    const nodeParam = params.get(NODE_PARAM);
    if (nodeParam && doc.getNode(nodeParam)) {
      useSelectionStore.getState().set([nodeParam]);
      const bounds = getWorldBounds(doc, nodeParam);
      const viewport = readViewport(getViewport);
      // ~20% margin: fitBounds pads by `padding` px on each side.
      const padding = Math.min(viewport.width, viewport.height) * 0.1;
      useCameraStore.getState().setCamera(fitBounds(bounds, viewport, padding));
    }
  }, [ready, doc, setActivePageId, getViewport, docVersion]);

  // --- R2 (write): keep ?node-id synced with the single selection ----------
  useEffect(() => {
    if (!ready || !fileId) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const write = () => {
      const ids = useSelectionStore.getState().selectedIds;
      // Multi-select: keep the FIRST id (deep links address one node).
      const nodeId = ids[0];
      const current = new URLSearchParams(searchParamsRef.current);
      if (nodeId) current.set(NODE_PARAM, nodeId);
      else current.delete(NODE_PARAM);
      const next = current.toString();
      const now = searchParamsRef.current.toString();
      if (next === now) return;
      const suffix = next ? `?${next}` : '';
      navigate(`${locationRef.current.pathname}${suffix}`, { replace: true });
    };
    const unsub = useSelectionStore.subscribe(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(write, SYNC_DEBOUNCE_MS);
    });
    return () => {
      if (timer) clearTimeout(timer);
      unsub();
    };
  }, [ready, fileId, navigate]);

  // --- R3 (write): mirror page switches into ?page -------------------------
  useEffect(() => {
    if (!ready || !fileId || !activePageId) return;
    // Only after the mount-read has seeded the baseline, and only on a genuine
    // switch away from the page currently reflected in the URL — the initial
    // activation must NOT write `?page` (keeps clean URLs / avoids a loop).
    if (!deepLinkAppliedRef.current) return;
    if (syncedPageRef.current === activePageId) return;
    syncedPageRef.current = activePageId;
    const current = new URLSearchParams(searchParamsRef.current);
    if (current.get(PAGE_PARAM) === activePageId) return;
    current.set(PAGE_PARAM, activePageId);
    const next = current.toString();
    const suffix = next ? `?${next}` : '';
    navigate(`${locationRef.current.pathname}${suffix}`, { replace: true });
  }, [ready, fileId, activePageId, navigate, docVersion]);
}
