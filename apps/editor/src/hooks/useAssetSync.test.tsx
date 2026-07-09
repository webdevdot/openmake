import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OpenDoc } from '@openmake/core';

// Stub the asset endpoint so the hook never hits the network.
const fetchAsset = vi.fn(async (_fileId: string, hash: string) => new Uint8Array([hash.length]));
vi.mock('../api/endpoints.js', () => ({
  filesApi: { fetchAsset: (fileId: string, hash: string) => fetchAsset(fileId, hash) },
}));

import { useAssetSync } from './useAssetSync.js';
import { useImageStore } from '../store/images.js';

/** Build a doc with one IMAGE-filled rectangle on its first page. */
function docWithImage(assetId: string): { doc: OpenDoc; pageId: string } {
  const doc = OpenDoc.create();
  const pageId = doc.getPages()[0]!;
  doc.createNode({
    type: 'RECTANGLE',
    parentId: pageId,
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    fills: [{ type: 'IMAGE', assetId, scaleMode: 'FILL', opacity: 1, visible: true }],
  });
  return { doc, pageId };
}

beforeEach(() => {
  fetchAsset.mockClear();
  useImageStore.setState({ images: {} });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useAssetSync', () => {
  it('fetches bytes for a referenced-but-uncached asset and populates the store', async () => {
    const { doc, pageId } = docWithImage('hash-x');
    renderHook(() => useAssetSync({ doc, pageId, fileId: 'file-1' }));

    await waitFor(() => expect(useImageStore.getState().images['hash-x']).toBeDefined());
    expect(fetchAsset).toHaveBeenCalledWith('file-1', 'hash-x');
    expect(fetchAsset).toHaveBeenCalledTimes(1);
  });

  it('does not fetch an asset already present in the cache', async () => {
    const { doc, pageId } = docWithImage('hash-cached');
    useImageStore.setState({ images: { 'hash-cached': new Uint8Array([7]) } });

    renderHook(() => useAssetSync({ doc, pageId, fileId: 'file-1' }));

    // Give any (unwanted) fetch a chance to fire.
    await new Promise((r) => setTimeout(r, 20));
    expect(fetchAsset).not.toHaveBeenCalled();
  });

  it('dedupes: an asset added later over collab is fetched exactly once', async () => {
    const doc = OpenDoc.create();
    const pageId = doc.getPages()[0]!;
    renderHook(() => useAssetSync({ doc, pageId, fileId: 'file-1' }));

    // Simulate a teammate adding an image after load — two mutations referencing
    // the same asset should still only trigger one fetch.
    doc.createNode({
      type: 'RECTANGLE',
      parentId: pageId,
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      fills: [{ type: 'IMAGE', assetId: 'hash-late', scaleMode: 'FILL', opacity: 1, visible: true }],
    });
    doc.createNode({
      type: 'RECTANGLE',
      parentId: pageId,
      x: 20,
      y: 0,
      width: 10,
      height: 10,
      fills: [{ type: 'IMAGE', assetId: 'hash-late', scaleMode: 'FILL', opacity: 1, visible: true }],
    });

    await waitFor(() => expect(useImageStore.getState().images['hash-late']).toBeDefined());
    expect(fetchAsset).toHaveBeenCalledTimes(1);
  });

  it('does nothing without a fileId', async () => {
    const { doc, pageId } = docWithImage('hash-y');
    renderHook(() => useAssetSync({ doc, pageId, fileId: '' }));
    await new Promise((r) => setTimeout(r, 20));
    expect(fetchAsset).not.toHaveBeenCalled();
  });

  it('swallows fetch errors without throwing', async () => {
    fetchAsset.mockRejectedValueOnce(new Error('network'));
    const { doc, pageId } = docWithImage('hash-err');
    renderHook(() => useAssetSync({ doc, pageId, fileId: 'file-1' }));

    await waitFor(() => expect(fetchAsset).toHaveBeenCalled());
    // No bytes cached, but nothing throws.
    expect(useImageStore.getState().images['hash-err']).toBeUndefined();
  });
});
