import { describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret } from '../src/crypto.js';

const MASTER_KEY = 'a'.repeat(64);
const OTHER_KEY = 'b'.repeat(64);

describe('encryptSecret / decryptSecret', () => {
  it('round-trips plaintext', () => {
    const ciphertext = encryptSecret('sk-super-secret-key', MASTER_KEY);
    expect(ciphertext).not.toContain('sk-super-secret-key');
    expect(decryptSecret(ciphertext, MASTER_KEY)).toBe('sk-super-secret-key');
  });

  it('produces a different ciphertext each call (random IV)', () => {
    const a = encryptSecret('same-plaintext', MASTER_KEY);
    const b = encryptSecret('same-plaintext', MASTER_KEY);
    expect(a).not.toBe(b);
  });

  it('throws when ciphertext is tampered with', () => {
    const ciphertext = encryptSecret('sk-super-secret-key', MASTER_KEY);
    const raw = Buffer.from(ciphertext, 'base64');
    raw[raw.length - 1] = (raw[raw.length - 1]! ^ 0xff) & 0xff;
    const tampered = raw.toString('base64');
    expect(() => decryptSecret(tampered, MASTER_KEY)).toThrow();
  });

  it('throws when decrypting with the wrong key', () => {
    const ciphertext = encryptSecret('sk-super-secret-key', MASTER_KEY);
    expect(() => decryptSecret(ciphertext, OTHER_KEY)).toThrow();
  });

  it('throws on a master key of the wrong length', () => {
    expect(() => encryptSecret('x', 'tooshort')).toThrow();
    expect(() => decryptSecret('irrelevant', 'nothex'.repeat(20))).toThrow();
  });

  it('throws on a non-hex master key', () => {
    expect(() => encryptSecret('x', 'z'.repeat(64))).toThrow();
  });
});
