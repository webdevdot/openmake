import { describe, expect, it } from 'vitest';
import { duplicateOffset, DUPLICATE_OFFSET } from './duplicate.js';

describe('duplicateOffset', () => {
  it('offsets both x and y by the fixed duplicate offset', () => {
    expect(duplicateOffset({ x: 10, y: 20 })).toEqual({ x: 10 + DUPLICATE_OFFSET, y: 20 + DUPLICATE_OFFSET });
  });

  it('handles negative source coordinates', () => {
    expect(duplicateOffset({ x: -5, y: -5 })).toEqual({ x: -5 + DUPLICATE_OFFSET, y: -5 + DUPLICATE_OFFSET });
  });
});
