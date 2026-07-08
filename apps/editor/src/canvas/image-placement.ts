import type { AssetRef } from '@openmake/shared';

/**
 * Pure helpers for placing a picked image into the document as an IMAGE-filled
 * node. The DOM-facing bits (the <input type=file> picker and image decoding)
 * live in the useCreateImage hook; everything here is deterministic so it can
 * be unit-tested without a browser.
 *
 * The document only ever stores a content-addressed AssetRef (a SHA-256 hash +
 * mime + natural size); the pixels are cached editor-locally in useImageStore.
 */

/** Hex-encode a SHA-256 digest of the given bytes → stable assetId. */
export async function hashBytes(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as unknown as BufferSource);
  const view = new Uint8Array(digest);
  let hex = '';
  for (const b of view) hex += b.toString(16).padStart(2, '0');
  return hex;
}

/** Build the AssetRef the document stores for a picked image. */
export function makeAssetRef(
  hash: string,
  mime: string,
  natural: { width: number; height: number },
): AssetRef {
  return { hash, mime, width: natural.width, height: natural.height };
}

/**
 * Compute the top-left world position that centers a `width`×`height` box on
 * the given world-space center point.
 */
export function centeredTopLeft(
  center: { x: number; y: number },
  size: { width: number; height: number },
): { x: number; y: number } {
  return { x: center.x - size.width / 2, y: center.y - size.height / 2 };
}
