const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

// Web Crypto exists in browsers and Node 22+; typed structurally to stay lib-agnostic.
const webCrypto = (globalThis as unknown as { crypto: { getRandomValues(b: Uint8Array): Uint8Array } })
  .crypto;

/** Collision-resistant 16-char base62 id, optionally prefixed (`node_x7Kp…`). */
export function createId(prefix?: string): string {
  const bytes = new Uint8Array(16);
  webCrypto.getRandomValues(bytes);
  let id = '';
  for (const byte of bytes) id += ALPHABET[byte % 62];
  return prefix ? `${prefix}_${id}` : id;
}
