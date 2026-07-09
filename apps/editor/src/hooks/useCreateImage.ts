import { useCallback } from 'react';
import type { OpenDoc } from '@openmake/core';
import { useImageStore } from '../store/images.js';
import { filesApi } from '../api/endpoints.js';
import { hashBytes, makeAssetRef, centeredTopLeft } from '../canvas/image-placement.js';

const ACCEPT = 'image/png,image/jpeg';

/** Read the natural pixel dimensions of a decoded image blob. */
async function decodeNaturalSize(
  bytes: Uint8Array,
  mime: string,
): Promise<{ width: number; height: number }> {
  const blob = new Blob([bytes as unknown as BlobPart], { type: mime });
  const bitmap = await createImageBitmap(blob);
  const size = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return size;
}

/** Prompt the user for a png/jpeg file and resolve its bytes + mime (or null if cancelled). */
function pickImageFile(): Promise<{ bytes: Uint8Array; mime: string } | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = ACCEPT;
    input.style.display = 'none';
    let settled = false;
    const done = (value: { bytes: Uint8Array; mime: string } | null) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(value);
    };
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) return done(null);
      void file.arrayBuffer().then((buf) => done({ bytes: new Uint8Array(buf), mime: file.type }));
    });
    // A cancelled picker fires no `change`; `cancel` (where supported) cleans up.
    input.addEventListener('cancel', () => done(null));
    document.body.appendChild(input);
    input.click();
  });
}

/**
 * Client-side image placement: pick a png/jpeg, content-hash it into an
 * assetId, register the AssetRef on the doc and the raw bytes in the local
 * image cache, then create an IMAGE-filled node at natural size centered on
 * `worldCenter`.
 *
 * The pixels are also uploaded to the asset server in the background so a reload
 * (or a teammate) can fetch them — but that upload is optimistic: node creation
 * never blocks on it and a failed upload only logs (the local render already
 * works, and the content-addressed retry is idempotent next time).
 *
 * Returns the created node id, or null if the picker was cancelled.
 */
export function useCreateImage({
  doc,
  pageId,
  fileId,
}: {
  doc: OpenDoc;
  pageId: string;
  fileId: string;
}): (worldCenter: { x: number; y: number }) => Promise<string | null> {
  return useCallback(
    async (worldCenter) => {
      const picked = await pickImageFile();
      if (!picked) return null;
      const { bytes, mime } = picked;
      const assetId = await hashBytes(bytes);
      const natural = await decodeNaturalSize(bytes, mime);
      doc.setAsset(assetId, makeAssetRef(assetId, mime, natural));
      useImageStore.getState().setImage(assetId, bytes);

      // Fire-and-forget: persist the pixels server-side without blocking the
      // node from appearing. Errors are swallowed (logged) by design.
      if (fileId) {
        void filesApi.uploadAsset(fileId, assetId, bytes, mime).catch((err: unknown) => {
          console.warn('image asset upload failed (will retry on next use)', err);
        });
      }

      const { x, y } = centeredTopLeft(worldCenter, natural);
      const id = doc.createNode({
        type: 'RECTANGLE',
        parentId: pageId,
        x,
        y,
        width: natural.width,
        height: natural.height,
        fills: [{ type: 'IMAGE', assetId, scaleMode: 'FILL', opacity: 1, visible: true }],
      });
      doc.commitUndoGroup();
      return id;
    },
    [doc, pageId, fileId],
  );
}
