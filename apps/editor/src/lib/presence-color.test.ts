import { describe, expect, it } from 'vitest';
import { presenceColorForUserId } from './presence-color.js';

describe('presenceColorForUserId', () => {
  it('is deterministic for the same user id', () => {
    expect(presenceColorForUserId('user-123')).toBe(presenceColorForUserId('user-123'));
  });

  it('returns a valid hex color string', () => {
    expect(presenceColorForUserId('user-abc')).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('tends to differ across different user ids', () => {
    const colors = new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map(presenceColorForUserId));
    expect(colors.size).toBeGreaterThan(1);
  });
});
