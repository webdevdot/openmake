import { describe, expect, it } from 'vitest';
import { presenceColorForUserId, presenceLabelColor } from './presence-color.js';

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

describe('presenceLabelColor', () => {
  it('returns dark ink on yellow (white would be ~1.9:1)', () => {
    expect(presenceLabelColor('#eab308')).toBe('#18181b');
  });

  it('returns white on very dark backgrounds', () => {
    expect(presenceLabelColor('#18181b')).toBe('#ffffff');
    expect(presenceLabelColor('#000000')).toBe('#ffffff');
  });

  it('returns dark ink on very light backgrounds', () => {
    expect(presenceLabelColor('#ffffff')).toBe('#18181b');
  });

  it('is deterministic for borderline colors like indigo', () => {
    const first = presenceLabelColor('#6366f1');
    expect(['#18181b', '#ffffff']).toContain(first);
    for (let i = 0; i < 5; i++) {
      expect(presenceLabelColor('#6366f1')).toBe(first);
    }
  });

  it('supports 3-digit hex shorthand', () => {
    expect(presenceLabelColor('#ff0')).toBe('#18181b');
    expect(presenceLabelColor('#000')).toBe('#ffffff');
  });
});
