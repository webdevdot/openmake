import type { TextNode } from '@openmake/shared';

export interface MeasureText {
  (node: TextNode, maxWidth?: number): { width: number; height: number };
}

/**
 * Rough character-count approximation, good enough as a default until a real
 * font-metrics measurer is injected by the caller (e.g. a canvas/DOM-backed
 * one in the renderer).
 */
export const defaultMeasureText: MeasureText = (node, maxWidth) => {
  const { fontSize, lineHeight } = node.textStyle;
  const charWidth = fontSize * 0.55;
  const naturalWidth = node.characters.length * charWidth;
  const width = maxWidth !== undefined ? Math.min(naturalWidth, maxWidth) : naturalWidth;
  const lineHeightMultiplier = lineHeight === 'AUTO' ? 1.2 : lineHeight;
  const lines = width > 0 ? Math.max(1, Math.ceil(naturalWidth / Math.max(width, 1))) : 1;
  const height = fontSize * lineHeightMultiplier * lines;
  return { width, height };
};
