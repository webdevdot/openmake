import { describe, expect, it } from 'vitest';
import { resolveShortcut } from './shortcuts.js';

const key = (
  overrides: Partial<{ key: string; shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }>,
) => ({
  key: '',
  shiftKey: false,
  metaKey: false,
  ctrlKey: false,
  ...overrides,
});

describe('resolveShortcut', () => {
  it('maps tool letter keys to tool actions', () => {
    expect(resolveShortcut(key({ key: 'v' }))).toEqual({ type: 'tool', tool: 'select' });
    expect(resolveShortcut(key({ key: 'R' }))).toEqual({ type: 'tool', tool: 'rectangle' });
    expect(resolveShortcut(key({ key: 'h' }))).toEqual({ type: 'tool', tool: 'hand' });
    expect(resolveShortcut(key({ key: 'p' }))).toEqual({ type: 'tool', tool: 'pen' });
  });

  it('maps cmd/ctrl+z to undo and shift+cmd+z to redo', () => {
    expect(resolveShortcut(key({ key: 'z', metaKey: true }))).toEqual({ type: 'undo' });
    expect(resolveShortcut(key({ key: 'z', ctrlKey: true }))).toEqual({ type: 'undo' });
    expect(resolveShortcut(key({ key: 'z', metaKey: true, shiftKey: true }))).toEqual({
      type: 'redo',
    });
  });

  it('maps cmd/ctrl+d to duplicate', () => {
    expect(resolveShortcut(key({ key: 'd', metaKey: true }))).toEqual({ type: 'duplicate' });
  });

  it('maps Delete/Backspace to delete', () => {
    expect(resolveShortcut(key({ key: 'Delete' }))).toEqual({ type: 'delete' });
    expect(resolveShortcut(key({ key: 'Backspace' }))).toEqual({ type: 'delete' });
  });

  it('maps Escape to deselect', () => {
    expect(resolveShortcut(key({ key: 'Escape' }))).toEqual({ type: 'deselect' });
  });

  it('maps arrow keys to nudge, with shift for a bigger step', () => {
    expect(resolveShortcut(key({ key: 'ArrowLeft' }))).toEqual({
      type: 'nudge',
      dx: -1,
      dy: 0,
      big: false,
    });
    expect(resolveShortcut(key({ key: 'ArrowRight', shiftKey: true }))).toEqual({
      type: 'nudge',
      dx: 10,
      dy: 0,
      big: true,
    });
    expect(resolveShortcut(key({ key: 'ArrowUp' }))).toEqual({
      type: 'nudge',
      dx: 0,
      dy: -1,
      big: false,
    });
    expect(resolveShortcut(key({ key: 'ArrowDown' }))).toEqual({
      type: 'nudge',
      dx: 0,
      dy: 1,
      big: false,
    });
  });

  it('maps zoom keys', () => {
    expect(resolveShortcut(key({ key: '+' }))).toEqual({ type: 'zoom-in' });
    expect(resolveShortcut(key({ key: '=' }))).toEqual({ type: 'zoom-in' });
    expect(resolveShortcut(key({ key: '-' }))).toEqual({ type: 'zoom-out' });
    expect(resolveShortcut(key({ key: '0' }))).toEqual({ type: 'zoom-reset' });
  });

  it('maps shift+= (the physical "+" chord) to zoom-in', () => {
    expect(resolveShortcut(key({ key: '+', shiftKey: true }))).toEqual({ type: 'zoom-in' });
  });

  it('returns null for unbound keys', () => {
    expect(resolveShortcut(key({ key: 'q' }))).toBeNull();
  });

  it('modifier-held tool letters do not trigger tool switch (avoids clobbering browser shortcuts)', () => {
    expect(resolveShortcut(key({ key: 'v', metaKey: true }))).toBeNull();
  });
});
