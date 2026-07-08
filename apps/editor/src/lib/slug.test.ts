import { describe, expect, it } from 'vitest';
import { slugify } from './slug.js';

describe('slugify', () => {
  it('lowercases and hyphenates a normal name', () => {
    expect(slugify('My Cool Design')).toBe('my-cool-design');
  });

  it('collapses runs of non-alphanumerics to a single hyphen', () => {
    expect(slugify('Foo   ---  Bar!!!Baz')).toBe('foo-bar-baz');
  });

  it('trims leading and trailing hyphens', () => {
    expect(slugify('  ...Hello...  ')).toBe('hello');
  });

  it('preserves digits', () => {
    expect(slugify('Version 2 Layout')).toBe('version-2-layout');
  });

  it('falls back to "untitled" for empty or all-symbol names', () => {
    expect(slugify('')).toBe('untitled');
    expect(slugify('!!!')).toBe('untitled');
    expect(slugify('   ')).toBe('untitled');
  });
});
