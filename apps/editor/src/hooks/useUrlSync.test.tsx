import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OpenDoc } from '@openmake/core';
import { useUrlSync } from './useUrlSync.js';
import { useSelectionStore } from '../store/selection.js';
import { useCameraStore } from '../store/camera.js';
import { DEFAULT_CAMERA } from '../canvas/camera.js';
import type { CollabSession } from './useCollab.js';

// --- Router mock ------------------------------------------------------------
// A single mutable URL state that the mocked react-router hooks read from, and
// that `navigate()` rewrites. `navigate` records every call and, with
// replace:true, mutates the state so a subsequent rerender sees the new URL —
// mirroring how the real router feeds params back into the hook.
interface RouterState {
  fileId: string;
  slug?: string;
  pathname: string;
  search: string;
}

const router = vi.hoisted(() => ({
  state: { fileId: 'f1', slug: undefined, pathname: '/file/f1', search: '' } as RouterState,
  navigate: vi.fn(),
}));

vi.mock('react-router-dom', () => ({
  useParams: () => ({ fileId: router.state.fileId, slug: router.state.slug }),
  useLocation: () => ({ pathname: router.state.pathname, search: router.state.search }),
  useNavigate: () => router.navigate,
  useSearchParams: () => [new URLSearchParams(router.state.search), vi.fn()] as const,
}));

/** Apply a `navigate(to, { replace })` call to the shared router state. */
function applyNavigate(to: string): void {
  const [pathname, search = ''] = to.split('?');
  router.state.pathname = pathname!;
  router.state.search = search ? `?${search}` : '';
  const segs = pathname!.split('/').filter(Boolean); // ['file', fileId, slug?]
  router.state.fileId = segs[1] ?? router.state.fileId;
  router.state.slug = segs[2];
}

function lastNavigate(): [string, { replace?: boolean }] | undefined {
  const calls = router.navigate.mock.calls;
  return calls[calls.length - 1] as [string, { replace?: boolean }] | undefined;
}

// --- Doc / session helpers --------------------------------------------------
function makeSession(name = 'My File'): { session: CollabSession; doc: OpenDoc } {
  const doc = OpenDoc.create({ name });
  const session = { doc, client: {}, status: 'connected' } as unknown as CollabSession;
  return { session, doc };
}

/** A doc with NO pages yet — simulates a session before the first sync. */
function makeEmptySession(): { session: CollabSession; doc: OpenDoc } {
  const doc = OpenDoc.create({ name: 'Empty' });
  // Remove the default page so getPages() is empty (not-yet-synced state).
  const pageId = doc.getPages()[0]!;
  doc.deleteNode(pageId);
  const session = { doc, client: {}, status: 'connected' } as unknown as CollabSession;
  return { session, doc };
}

function addRect(doc: OpenDoc, pageId: string): string {
  return doc.createNode({
    type: 'RECTANGLE',
    parentId: pageId,
    x: 100,
    y: 200,
    width: 300,
    height: 400,
  } as never);
}

const viewport = { width: 1000, height: 800 };

beforeEach(() => {
  router.state = { fileId: 'f1', slug: undefined, pathname: '/file/f1', search: '' };
  router.navigate.mockReset();
  router.navigate.mockImplementation((to: string, opts?: { replace?: boolean }) => {
    if (opts?.replace) applyNavigate(to);
  });
  useSelectionStore.getState().clear();
  useCameraStore.getState().setCamera({ ...DEFAULT_CAMERA });
});

afterEach(() => {
  vi.useRealTimers();
});

function setup(session: CollabSession | null, activePageId: string | null) {
  let pageId = activePageId;
  const setActivePageId = vi.fn((id: string) => {
    pageId = id;
  });
  const rendered = renderHook(
    ({ ap }) =>
      useUrlSync({ session, activePageId: ap, setActivePageId, getViewport: () => viewport }),
    { initialProps: { ap: activePageId } },
  );
  return {
    ...rendered,
    setActivePageId,
    rerenderWith: (next: string | null) => {
      pageId = next;
      rendered.rerender({ ap: next });
    },
    getPageId: () => pageId,
  };
}

describe('useUrlSync — slug canonicalization (R1)', () => {
  it('replaces the URL with a kebab-case slug of the file name once ready', () => {
    const { session } = makeSession('My Cool Design');
    const pageId = session.doc.getPages()[0]!;
    setup(session, pageId);

    const slugCall = router.navigate.mock.calls.find(
      (c) => c[0] === '/file/f1/my-cool-design',
    );
    expect(slugCall).toBeDefined();
    expect(slugCall?.[1]).toEqual({ replace: true });
  });

  it('does not navigate when the slug already matches', () => {
    router.state.slug = 'my-cool-design';
    router.state.pathname = '/file/f1/my-cool-design';
    const { session } = makeSession('My Cool Design');
    const pageId = session.doc.getPages()[0]!;
    setup(session, pageId);

    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('preserves an existing query string when canonicalizing', () => {
    router.state.search = '?node-id=abc&page=xyz';
    const { session } = makeSession('Hello World');
    const pageId = session.doc.getPages()[0]!;
    // Prevent the node-id/page params from being applied by keeping them unknown.
    setup(session, pageId);

    const slugCall = router.navigate.mock.calls.find((c) =>
      String(c[0]).startsWith('/file/f1/hello-world'),
    );
    expect(slugCall?.[0]).toBe('/file/f1/hello-world?node-id=abc&page=xyz');
  });

  it('does nothing while the doc has no content (not yet synced)', () => {
    const { session } = makeEmptySession();
    setup(session, null);
    expect(router.navigate).not.toHaveBeenCalled();
  });
});

describe('useUrlSync — node-id deep link (R2)', () => {
  it('selects the node and zooms to fit when ?node-id points at an existing node', () => {
    const { session, doc } = makeSession('Design');
    const pageId = doc.getPages()[0]!;
    const rectId = addRect(doc, pageId);
    router.state.slug = 'design'; // avoid slug navigation noise
    router.state.pathname = '/file/f1/design';
    router.state.search = `?node-id=${rectId}`;

    setup(session, pageId);

    expect(useSelectionStore.getState().selectedIds).toEqual([rectId]);
    // Camera moved off the default to frame the node.
    const cam = useCameraStore.getState().camera;
    expect(cam).not.toEqual(DEFAULT_CAMERA);
    // Node center (250, 400) sits at the viewport center after fitting.
    const centerWorldX = cam.x + viewport.width / 2 / cam.zoom;
    const centerWorldY = cam.y + viewport.height / 2 / cam.zoom;
    expect(centerWorldX).toBeCloseTo(250, 3);
    expect(centerWorldY).toBeCloseTo(400, 3);
  });

  it('no-ops for an unknown node id (no selection, no camera move)', () => {
    const { session, doc } = makeSession('Design');
    const pageId = doc.getPages()[0]!;
    router.state.slug = 'design';
    router.state.pathname = '/file/f1/design';
    router.state.search = '?node-id=does-not-exist';

    setup(session, pageId);

    expect(useSelectionStore.getState().selectedIds).toEqual([]);
    expect(useCameraStore.getState().camera).toEqual(DEFAULT_CAMERA);
  });

  it('syncs the param to the single selection, debounced (~300ms), with replace', () => {
    vi.useFakeTimers();
    const { session, doc } = makeSession('Design');
    const pageId = doc.getPages()[0]!;
    const rectId = addRect(doc, pageId);
    router.state.slug = 'design';
    router.state.pathname = '/file/f1/design';

    setup(session, pageId);
    router.navigate.mockClear();

    act(() => {
      useSelectionStore.getState().set([rectId]);
    });
    // Not written until the debounce elapses.
    expect(router.navigate).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(300);
    });
    const nav = lastNavigate();
    expect(nav?.[0]).toBe(`/file/f1/design?node-id=${rectId}`);
    expect(nav?.[1]).toEqual({ replace: true });
  });

  it('keeps the FIRST id on multi-select', () => {
    vi.useFakeTimers();
    const { session, doc } = makeSession('Design');
    const pageId = doc.getPages()[0]!;
    const a = addRect(doc, pageId);
    const b = addRect(doc, pageId);
    router.state.slug = 'design';
    router.state.pathname = '/file/f1/design';

    setup(session, pageId);
    router.navigate.mockClear();

    act(() => {
      useSelectionStore.getState().set([a, b]);
    });
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(lastNavigate()?.[0]).toBe(`/file/f1/design?node-id=${a}`);
  });

  it('clears the param on empty selection', () => {
    vi.useFakeTimers();
    const { session, doc } = makeSession('Design');
    const pageId = doc.getPages()[0]!;
    const rectId = addRect(doc, pageId);
    router.state.slug = 'design';
    router.state.pathname = '/file/f1/design';
    router.state.search = `?node-id=${rectId}`;

    setup(session, pageId);
    router.navigate.mockClear();

    act(() => {
      useSelectionStore.getState().clear();
    });
    act(() => {
      vi.advanceTimersByTime(300);
    });
    const nav = lastNavigate();
    expect(nav?.[0]).toBe('/file/f1/design');
    expect(nav?.[1]).toEqual({ replace: true });
  });
});

describe('useUrlSync — page param (R3)', () => {
  it('activates the page named by ?page when it exists', () => {
    const { session, doc } = makeSession('Design');
    const firstPage = doc.getPages()[0]!;
    const secondPage = doc.createNode({ type: 'PAGE', parentId: doc.rootId } as never);
    router.state.slug = 'design';
    router.state.pathname = '/file/f1/design';
    router.state.search = `?page=${secondPage}`;

    const h = setup(session, firstPage);
    expect(h.setActivePageId).toHaveBeenCalledWith(secondPage);
  });

  it('falls back silently to the first page for an invalid ?page', () => {
    const { session, doc } = makeSession('Design');
    const firstPage = doc.getPages()[0]!;
    router.state.slug = 'design';
    router.state.pathname = '/file/f1/design';
    router.state.search = '?page=bogus';

    const h = setup(session, firstPage);
    // Invalid id → no explicit activation; EditorPage's existing first-page
    // default stands. setActivePageId must not be called with the bogus id.
    expect(h.setActivePageId).not.toHaveBeenCalledWith('bogus');
  });

  it('writes ?page when the user switches pages', () => {
    const { session, doc } = makeSession('Design');
    const firstPage = doc.getPages()[0]!;
    const secondPage = doc.createNode({ type: 'PAGE', parentId: doc.rootId } as never);
    router.state.slug = 'design';
    router.state.pathname = '/file/f1/design';

    const h = setup(session, firstPage);
    router.navigate.mockClear();

    act(() => {
      h.rerenderWith(secondPage);
    });
    const nav = lastNavigate();
    expect(nav?.[0]).toBe(`/file/f1/design?page=${secondPage}`);
    expect(nav?.[1]).toEqual({ replace: true });
  });
});

describe('useUrlSync — cold-load deep link', () => {
  it('applies ?node-id + ?page once the doc syncs (content arrives after mount)', () => {
    // Start with an empty (unsynced) doc and a deep-link URL.
    const doc = OpenDoc.create({ name: 'Cold' });
    const bootPage = doc.getPages()[0]!;
    doc.deleteNode(bootPage); // no pages yet
    const session = { doc, client: {}, status: 'connected' } as unknown as CollabSession;

    router.state.slug = 'cold';
    router.state.pathname = '/file/f1/cold';

    const h = setup(session, null);
    // Nothing applied yet — the doc has no content.
    expect(useSelectionStore.getState().selectedIds).toEqual([]);
    expect(h.setActivePageId).not.toHaveBeenCalled();

    // Simulate the first sync: page + node appear, then set the deep-link URL.
    const pageId = doc.createNode({ type: 'PAGE', parentId: doc.rootId } as never);
    const rectId = addRect(doc, pageId);
    router.state.search = `?page=${pageId}&node-id=${rectId}`;

    act(() => {
      h.rerender({ ap: null });
    });

    expect(h.setActivePageId).toHaveBeenCalledWith(pageId);
    expect(useSelectionStore.getState().selectedIds).toEqual([rectId]);
  });
});
