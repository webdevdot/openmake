import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// --- Module mocks: keep the hook's real logic, stub the heavy dependencies. ---

const exportPNG = vi.fn(async () => new Uint8Array([1, 2, 3]));
const dispose = vi.fn();
let renderInFlight = 0;
let maxConcurrent = 0;

vi.mock('@openmake/renderer', () => ({
  createCanvasKitRenderer: vi.fn(async () => {
    renderInFlight += 1;
    maxConcurrent = Math.max(maxConcurrent, renderInFlight);
    return {
      exportPNG: async () => {
        // Hold the slot until the caller resolves this render.
        await new Promise((r) => setTimeout(r, 5));
        const result = await exportPNG();
        renderInFlight -= 1;
        return result;
      },
      dispose,
    };
  }),
  buildRenderScene: vi.fn(() => ({
    rootIds: ['a'],
    nodes: { a: { id: 'a', x: 0, y: 0, width: 100, height: 50 } },
  })),
}));

vi.mock('@openmake/core', () => ({
  OpenDoc: {
    fromYDoc: vi.fn(() => ({ getPages: () => ['page-1'] })),
  },
}));

vi.mock('../store/variables.js', () => ({
  buildVariableColors: vi.fn(() => ({})),
}));

const snapshot = vi.fn(async (_id: string) => new Uint8Array([9, 9, 9]));
vi.mock('../api/endpoints.js', () => ({
  filesApi: { snapshot: (id: string) => snapshot(id) },
}));

// yjs applyUpdate is a no-op in these tests (fromYDoc is mocked).
vi.mock('yjs', () => ({ Doc: class {}, applyUpdate: vi.fn() }));

import {
  useFileThumbnail,
  __resetThumbnailCache,
  THUMBNAIL_CONCURRENCY,
} from './useFileThumbnail.js';

let urlCounter = 0;
const revoked: string[] = [];

beforeEach(() => {
  urlCounter = 0;
  revoked.length = 0;
  renderInFlight = 0;
  maxConcurrent = 0;
  exportPNG.mockClear();
  snapshot.mockClear();
  dispose.mockClear();
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn(() => `blob:mock-${++urlCounter}`),
    revokeObjectURL: vi.fn((u: string) => revoked.push(u)),
  });
});

afterEach(() => {
  __resetThumbnailCache();
  vi.unstubAllGlobals();
});

describe('useFileThumbnail', () => {
  it('renders the first page to a thumbnail url', async () => {
    const { result } = renderHook(() => useFileThumbnail('file-1', '2024-01-01'));
    expect(result.current.status).toBe('pending');

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.url).toBe('blob:mock-1');
    expect(snapshot).toHaveBeenCalledWith('file-1');
    expect(exportPNG).toHaveBeenCalledTimes(1);
  });

  it('serves a cache hit for the same updatedAt without re-rendering', async () => {
    const first = renderHook(() => useFileThumbnail('file-1', '2024-01-01'));
    await waitFor(() => expect(first.result.current.status).toBe('ready'));
    expect(exportPNG).toHaveBeenCalledTimes(1);

    // A second mount with the SAME updatedAt reuses the cached url.
    const second = renderHook(() => useFileThumbnail('file-1', '2024-01-01'));
    await waitFor(() => expect(second.result.current.status).toBe('ready'));
    expect(second.result.current.url).toBe('blob:mock-1');
    expect(exportPNG).toHaveBeenCalledTimes(1); // no extra render
  });

  it('re-renders and revokes the old url when updatedAt changes', async () => {
    const { result, rerender } = renderHook(
      ({ ts }: { ts: string }) => useFileThumbnail('file-1', ts),
      { initialProps: { ts: '2024-01-01' } },
    );
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.url).toBe('blob:mock-1');

    rerender({ ts: '2024-02-02' });
    await waitFor(() => expect(result.current.url).toBe('blob:mock-2'));
    expect(exportPNG).toHaveBeenCalledTimes(2);
    expect(revoked).toContain('blob:mock-1');
  });

  it('falls back to error status when snapshot fetch fails', async () => {
    snapshot.mockRejectedValueOnce(new Error('network'));
    const { result } = renderHook(() => useFileThumbnail('file-err', '2024-01-01'));
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.url).toBeNull();
  });

  it('caps concurrent generations at THUMBNAIL_CONCURRENCY', async () => {
    const hooks = Array.from({ length: THUMBNAIL_CONCURRENCY + 3 }, (_, i) =>
      renderHook(() => useFileThumbnail(`file-${i}`, '2024-01-01')),
    );
    await Promise.all(
      hooks.map((h) => waitFor(() => expect(h.result.current.status).toBe('ready'))),
    );
    expect(maxConcurrent).toBeLessThanOrEqual(THUMBNAIL_CONCURRENCY);
    expect(exportPNG).toHaveBeenCalledTimes(THUMBNAIL_CONCURRENCY + 3);
  });
});
