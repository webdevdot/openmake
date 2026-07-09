import { describe, expect, it } from 'vitest';
import { OpenDoc } from '@openmake/core';
import {
  hashBytes,
  makeAssetRef,
  centeredTopLeft,
  collectPageImageAssetIds,
} from './image-placement.js';

describe('image-placement', () => {
  it('hashBytes returns a stable 64-char hex SHA-256', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const hash = await hashBytes(bytes);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    // Deterministic: same bytes → same hash.
    expect(await hashBytes(new Uint8Array([1, 2, 3, 4]))).toBe(hash);
    // Different bytes → different hash.
    expect(await hashBytes(new Uint8Array([1, 2, 3, 5]))).not.toBe(hash);
  });

  it('makeAssetRef carries the hash, mime and natural size', () => {
    const ref = makeAssetRef('abc', 'image/png', { width: 640, height: 480 });
    expect(ref).toEqual({ hash: 'abc', mime: 'image/png', width: 640, height: 480 });
  });

  it('centeredTopLeft offsets the box so it is centered on the point', () => {
    expect(centeredTopLeft({ x: 100, y: 100 }, { width: 40, height: 20 })).toEqual({
      x: 80,
      y: 90,
    });
  });

  describe('collectPageImageAssetIds', () => {
    it('collects assetIds from IMAGE fills across the page subtree, deduped', () => {
      const doc = OpenDoc.create();
      const pageId = doc.getPages()[0]!;

      // A frame with two image children sharing an assetId + a nested one.
      const frameId = doc.createNode({ type: 'FRAME', parentId: pageId, x: 0, y: 0, width: 200, height: 200 });
      doc.createNode({
        type: 'RECTANGLE',
        parentId: frameId,
        x: 0,
        y: 0,
        width: 50,
        height: 50,
        fills: [{ type: 'IMAGE', assetId: 'hash-a', scaleMode: 'FILL', opacity: 1, visible: true }],
      });
      doc.createNode({
        type: 'RECTANGLE',
        parentId: frameId,
        x: 60,
        y: 0,
        width: 50,
        height: 50,
        fills: [{ type: 'IMAGE', assetId: 'hash-a', scaleMode: 'FILL', opacity: 1, visible: true }],
      });
      doc.createNode({
        type: 'RECTANGLE',
        parentId: pageId,
        x: 0,
        y: 60,
        width: 50,
        height: 50,
        fills: [{ type: 'IMAGE', assetId: 'hash-b', scaleMode: 'FILL', opacity: 1, visible: true }],
      });
      // A non-image node contributes nothing.
      doc.createNode({
        type: 'RECTANGLE',
        parentId: pageId,
        x: 0,
        y: 120,
        width: 50,
        height: 50,
        fills: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0, a: 1 }, opacity: 1, visible: true }],
      });

      const ids = collectPageImageAssetIds(doc, pageId);
      expect(ids).toEqual(new Set(['hash-a', 'hash-b']));
    });

    it('returns an empty set for a page with no image fills', () => {
      const doc = OpenDoc.create();
      const pageId = doc.getPages()[0]!;
      expect(collectPageImageAssetIds(doc, pageId).size).toBe(0);
    });
  });
});
