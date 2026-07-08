import { create } from 'zustand';

/**
 * Client-side cache of decoded image bytes, keyed by assetId.
 *
 * The document stores image paints as an AssetRef (a content hash only), never
 * the pixels themselves — that keeps the CRDT small and lets bytes be fetched
 * or uploaded out of band. The renderer, however, needs the actual bytes to
 * draw an IMAGE paint, so the editor holds them here and threads a snapshot
 * into every `buildRenderScene` call (live loop, PNG/SVG export, present mode).
 *
 * This store is intentionally editor-local and non-collaborative: two clients
 * with the same doc resolve the same assetIds but each keeps its own byte cache.
 */
interface ImageBytesState {
  /** assetId → decoded png/jpg bytes. */
  images: Record<string, Uint8Array>;
  /** Insert or replace the bytes for one asset. */
  setImage: (assetId: string, bytes: Uint8Array) => void;
  /** Drop one asset's bytes (e.g. on delete/eviction). */
  removeImage: (assetId: string) => void;
  /** Replace the whole cache at once (e.g. after a bulk load). */
  setImages: (images: Record<string, Uint8Array>) => void;
}

export const useImageStore = create<ImageBytesState>((set) => ({
  images: {},
  setImage: (assetId, bytes) =>
    set((s) => ({ images: { ...s.images, [assetId]: bytes } })),
  removeImage: (assetId) =>
    set((s) => {
      if (!(assetId in s.images)) return s;
      const next = { ...s.images };
      delete next[assetId];
      return { images: next };
    }),
  setImages: (images) => set({ images }),
}));
