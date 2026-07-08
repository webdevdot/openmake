import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { OpenDoc } from '@openmake/core';
import type { Paint, TextStyle } from '@openmake/shared';
import type { Camera } from '../../canvas/camera.js';
import { TextEditorOverlay } from './TextEditorOverlay.js';

const cameraRef = { current: { x: 0, y: 0, zoom: 1 } satisfies Camera };

function setup(opts: { fills?: Paint[]; textStyle?: Partial<TextStyle> } = {}) {
  const doc = OpenDoc.create();
  const pageId = doc.getPages()[0]!;
  const nodeId = doc.createNode({
    type: 'TEXT',
    parentId: pageId,
    characters: 'Hello',
    x: 0,
    y: 0,
    width: 120,
    height: 40,
    fills: opts.fills ?? [],
    ...(opts.textStyle ? { textStyle: opts.textStyle } : {}),
  });
  return { doc, pageId, nodeId };
}

function renderOverlay(doc: OpenDoc, nodeId: string) {
  render(<TextEditorOverlay doc={doc} nodeId={nodeId} cameraRef={cameraRef} onCommit={() => {}} />);
  return screen.getByTestId('text-editor-overlay') as HTMLTextAreaElement;
}

describe('TextEditorOverlay text color', () => {
  it('uses the first visible SOLID fill of the node, not an app theme token', () => {
    const { doc, nodeId } = setup({
      fills: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0, a: 1 }, opacity: 1, visible: true }],
    });
    const textarea = renderOverlay(doc, nodeId);
    expect(textarea.style.color).toBe('rgba(255, 0, 0, 1)');
    expect(textarea.style.caretColor).toBe(textarea.style.color);
  });

  it('skips invisible fills and applies paint opacity to the alpha channel', () => {
    const { doc, nodeId } = setup({
      fills: [
        { type: 'SOLID', color: { r: 0, g: 0, b: 1, a: 1 }, opacity: 1, visible: false },
        { type: 'SOLID', color: { r: 0, g: 1, b: 0, a: 1 }, opacity: 0.5, visible: true },
      ],
    });
    const textarea = renderOverlay(doc, nodeId);
    expect(textarea.style.color).toBe('rgba(0, 255, 0, 0.5)');
  });

  it('falls back to black on a light page background when there is no visible solid fill', () => {
    // OpenDoc.create() pages default to a light (~#F5F5F5) background.
    const { doc, nodeId } = setup({ fills: [] });
    const textarea = renderOverlay(doc, nodeId);
    expect(textarea.style.color).toBe('rgba(0, 0, 0, 1)');
    expect(textarea.style.caretColor).toBe(textarea.style.color);
  });

  it('falls back to white on a dark page background when there is no visible solid fill', () => {
    const { doc, pageId, nodeId } = setup({ fills: [] });
    doc.updateNode(pageId, { backgroundColor: { r: 0.05, g: 0.05, b: 0.05, a: 1 } });
    const textarea = renderOverlay(doc, nodeId);
    expect(textarea.style.color).toBe('rgba(255, 255, 255, 1)');
  });
});

describe('TextEditorOverlay font', () => {
  it('mirrors the node textStyle (family, weight, style) instead of hardcoding Inter', () => {
    const { doc, nodeId } = setup({
      textStyle: { fontFamily: 'Roboto', fontSize: 24, fontWeight: 700, fontStyle: 'ITALIC' },
    });
    const textarea = renderOverlay(doc, nodeId);
    expect(textarea.style.fontFamily).toBe('Roboto');
    expect(textarea.style.fontWeight).toBe('700');
    expect(textarea.style.fontStyle).toBe('italic');
    expect(textarea.style.fontSize).toBe('24px');
  });
});
