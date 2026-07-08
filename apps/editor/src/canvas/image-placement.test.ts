import { describe, expect, it } from 'vitest';
import { hashBytes, makeAssetRef, centeredTopLeft } from './image-placement.js';

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
});
