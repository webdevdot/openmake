import { useEffect } from 'react';
import type { OpenDoc } from '@openmake/core';
import { useImageStore } from '../store/images.js';
import { filesApi } from '../api/endpoints.js';
import { collectPageImageAssetIds } from '../canvas/image-placement.js';

/**
 * Fetch-on-miss for image pixels. The document only stores content-addressed
 * AssetRefs; the bytes live in the editor-local {@link useImageStore}. When a
 * doc loads (or a teammate adds an image over collab), a node can reference an
 * assetId whose bytes aren't cached — this hook lazily fetches those bytes from
 * the asset server and populates the store so the renderer can draw them.
 *
 * It is:
 * - lazy — only fetches assetIds referenced on the current page,
 * - idempotent — never refetches what's already cached, and
 * - deduped — an in-flight fetch for an assetId is not started twice.
 *
 * Failures are swallowed (logged): a missing/unreachable asset simply renders
 * blank, exactly as before this hook existed.
 */
export function useAssetSync({
  doc,
  pageId,
  fileId,
}: {
  doc: OpenDoc;
  pageId: string;
  fileId: string;
}): void {
  useEffect(() => {
    if (!fileId) return;
    let cancelled = false;
    // assetIds with a fetch in flight for this doc/page/file scope.
    const pending = new Set<string>();

    const scan = (): void => {
      if (cancelled) return;
      const referenced = collectPageImageAssetIds(doc, pageId);
      const cache = useImageStore.getState().images;
      for (const assetId of referenced) {
        if (cache[assetId] || pending.has(assetId)) continue;
        pending.add(assetId);
        void filesApi
          .fetchAsset(fileId, assetId)
          .then((bytes) => {
            if (!cancelled) useImageStore.getState().setImage(assetId, bytes);
          })
          .catch((err: unknown) => {
            console.warn('image asset fetch failed', assetId, err);
          })
          .finally(() => {
            pending.delete(assetId);
          });
      }
    };

    // Initial pass for whatever the doc already contains, then re-scan on every
    // doc mutation (collab updates, undo/redo) that might introduce new images.
    scan();
    const unsubscribe = doc.subscribe(() => scan());

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [doc, pageId, fileId]);
}
