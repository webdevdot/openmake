import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Provider-key encryption at rest. AES-256-GCM with a random 12-byte IV per
 * call; output is `base64(iv ‖ authTag ‖ ciphertext)` so decryption needs
 * only the master key.
 */

const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_HEX_LENGTH = 64; // 32 bytes for AES-256

function parseMasterKey(masterKeyHex: string): Buffer {
  if (!/^[0-9a-fA-F]{64}$/.test(masterKeyHex)) {
    throw new Error(`Invalid master key: expected ${KEY_HEX_LENGTH} hex characters (32 bytes)`);
  }
  return Buffer.from(masterKeyHex, 'hex');
}

export function encryptSecret(plaintext: string, masterKeyHex: string): string {
  const key = parseMasterKey(masterKeyHex);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString('base64');
}

export function decryptSecret(ciphertext: string, masterKeyHex: string): string {
  const key = parseMasterKey(masterKeyHex);
  const raw = Buffer.from(ciphertext, 'base64');
  if (raw.length < IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error('Invalid ciphertext: too short to contain iv and auth tag');
  }
  const iv = raw.subarray(0, IV_LENGTH);
  const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = raw.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}
