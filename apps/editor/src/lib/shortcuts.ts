import type { ToolId } from '../store/tool.js';

export type ShortcutAction =
  | { type: 'tool'; tool: ToolId }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'delete' }
  | { type: 'duplicate' }
  | { type: 'deselect' }
  | { type: 'nudge'; dx: number; dy: number; big: boolean }
  | { type: 'zoom-in' }
  | { type: 'zoom-out' }
  | { type: 'zoom-reset' };

export interface KeyEventLike {
  key: string;
  shiftKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
}

const TOOL_KEYS: Record<string, ToolId> = {
  v: 'select',
  f: 'frame',
  r: 'rectangle',
  o: 'ellipse',
  l: 'line',
  t: 'text',
  h: 'hand',
};

/**
 * Pure mapping from a keyboard event to an editor action, or null if the key
 * combination isn't bound. Kept free of DOM/store access so it's trivially
 * unit-testable; the caller applies the returned action.
 */
export function resolveShortcut(e: KeyEventLike): ShortcutAction | null {
  const mod = e.metaKey || e.ctrlKey;
  const key = e.key.toLowerCase();

  if (mod && key === 'z') return e.shiftKey ? { type: 'redo' } : { type: 'undo' };
  if (mod && key === 'd') return { type: 'duplicate' };
  if (!mod && (e.key === 'Delete' || e.key === 'Backspace')) return { type: 'delete' };
  if (!mod && e.key === 'Escape') return { type: 'deselect' };

  if (!mod && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
    const step = e.shiftKey ? 10 : 1;
    const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
    const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
    return { type: 'nudge', dx, dy, big: e.shiftKey };
  }

  if (!mod && (e.key === '+' || e.key === '=')) return { type: 'zoom-in' };
  if (!mod && e.key === '-') return { type: 'zoom-out' };
  if (!mod && e.key === '0') return { type: 'zoom-reset' };

  if (!mod && key in TOOL_KEYS) return { type: 'tool', tool: TOOL_KEYS[key]! };

  return null;
}
