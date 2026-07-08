import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { OpenDoc } from '@openmake/core';
import { getWorldBounds } from '@openmake/core';
import type { Color, Paint, SolidPaint } from '@openmake/shared';
import { worldToScreen, type Camera } from '../../canvas/camera.js';

export interface TextEditorOverlayProps {
  doc: OpenDoc;
  nodeId: string;
  cameraRef: RefObject<Camera>;
  onCommit: () => void;
}

const to255 = (c: number) => Math.round(Math.min(1, Math.max(0, c)) * 255);

/** Color (0–1 floats) × paint opacity → CSS rgba() string. */
function colorToCssRgba(color: Color, opacity = 1): string {
  const a = Math.min(1, Math.max(0, color.a * opacity));
  return `rgba(${to255(color.r)}, ${to255(color.g)}, ${to255(color.b)}, ${a})`;
}

/** WCAG 2.x relative luminance (alpha ignored). */
function relativeLuminance(color: Color): number {
  const lin = (ch: number) => (ch <= 0.03928 ? ch / 12.92 : ((ch + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(color.r) + 0.7152 * lin(color.g) + 0.0722 * lin(color.b);
}

/** Background color of the PAGE ancestor of `nodeId`, if any. */
function pageBackgroundColor(doc: OpenDoc, nodeId: string): Color | undefined {
  let cur = doc.getParentId(nodeId);
  while (cur) {
    const node = doc.getNode(cur);
    if (node?.type === 'PAGE') return node.backgroundColor;
    cur = doc.getParentId(cur);
  }
  return undefined;
}

/**
 * Editing text color: the node's first visible SOLID fill so the overlay
 * matches the committed render; when there is none, black or white by WCAG
 * luminance of the page background (never an app theme token — the textarea
 * sits over document pixels, not app chrome).
 */
function editingTextColor(doc: OpenDoc, nodeId: string, fills: readonly Paint[]): string {
  const solid = fills.find((f): f is SolidPaint => f.type === 'SOLID' && f.visible);
  if (solid) return colorToCssRgba(solid.color, solid.opacity);
  const bg = pageBackgroundColor(doc, nodeId) ?? { r: 0.96, g: 0.96, b: 0.96, a: 1 };
  return relativeLuminance(bg) > 0.179
    ? colorToCssRgba({ r: 0, g: 0, b: 0, a: 1 })
    : colorToCssRgba({ r: 1, g: 1, b: 1, a: 1 });
}

/** Floating textarea positioned over a TEXT node; commits characters on blur/Escape. */
export function TextEditorOverlay({ doc, nodeId, cameraRef, onCommit }: TextEditorOverlayProps) {
  const node = doc.getNode(nodeId);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState(node && node.type === 'TEXT' ? node.characters : '');

  useEffect(() => {
    textareaRef.current?.focus();
    textareaRef.current?.select();
  }, []);

  if (!node || node.type !== 'TEXT' || !cameraRef.current) return null;

  const bounds = getWorldBounds(doc, nodeId);
  const topLeft = worldToScreen(cameraRef.current, { x: bounds.x, y: bounds.y });
  const textColor = editingTextColor(doc, nodeId, node.fills);

  const commit = () => {
    // Text layers are named by their content until explicitly renamed.
    const props: Record<string, unknown> = { characters: value };
    if (node.name === 'Text' || node.name === node.characters) {
      props.name = value.trim() === '' ? 'Text' : value.split('\n')[0]!.slice(0, 60);
    }
    doc.updateNode(nodeId, props);
    doc.commitUndoGroup();
    onCommit();
  };

  return (
    <textarea
      ref={textareaRef}
      data-testid="text-editor-overlay"
      className="absolute resize-none overflow-hidden border-2 bg-transparent outline-none"
      style={{
        left: topLeft.x,
        top: topLeft.y,
        width: Math.max(bounds.width, 40),
        minHeight: bounds.height,
        borderColor: 'var(--color-accent)',
        fontFamily: node.textStyle.fontFamily,
        fontSize: node.textStyle.fontSize,
        fontWeight: node.textStyle.fontWeight,
        fontStyle: node.textStyle.fontStyle === 'ITALIC' ? 'italic' : 'normal',
        color: textColor,
        caretColor: textColor,
      }}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.currentTarget.blur();
        }
      }}
    />
  );
}
