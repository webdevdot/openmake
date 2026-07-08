import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { OpenDoc } from '@openmake/core';
import type { PageNode } from '@openmake/shared';
import { PageInspector } from './PageInspector.js';
import { colorToHex } from '../../lib/color.js';

function setup() {
  const doc = OpenDoc.create();
  const pageId = doc.getPages()[0]!;
  const page = doc.getNode(pageId) as PageNode;
  return { doc, pageId, page };
}

function hexInput(): HTMLInputElement {
  return screen.getByTestId('page-background-hex') as HTMLInputElement;
}

describe('PageInspector', () => {
  it('syncs the hex input when the background color changes elsewhere', () => {
    const { doc, pageId, page } = setup();
    const { rerender } = render(<PageInspector doc={doc} page={page} />);

    doc.updateNode(pageId, { backgroundColor: { r: 1, g: 0, b: 0, a: 1 } });
    doc.commitUndoGroup();
    rerender(<PageInspector doc={doc} page={doc.getNode(pageId) as PageNode} />);

    expect(hexInput().value).toBe('FF0000');
  });

  it('commits a valid hex draft on Enter through updateNode', () => {
    const { doc, pageId, page } = setup();
    render(<PageInspector doc={doc} page={page} />);

    fireEvent.change(hexInput(), { target: { value: '00ff00' } });
    fireEvent.keyDown(hexInput(), { key: 'Enter' });

    const updated = doc.getNode(pageId) as PageNode;
    expect(colorToHex(updated.backgroundColor)).toBe('#00ff00');
    expect(hexInput().value).toBe('00FF00');
  });

  it('reverts the draft to the current color on invalid hex at blur', () => {
    const { doc, page } = setup();
    render(<PageInspector doc={doc} page={page} />);
    const original = hexInput().value;

    fireEvent.change(hexInput(), { target: { value: 'not-a-hex' } });
    fireEvent.blur(hexInput());

    expect(hexInput().value).toBe(original);
  });

  it('renders the page-level export section placeholder', () => {
    const { doc, page } = setup();
    render(<PageInspector doc={doc} page={page} />);

    const section = screen.getByTestId('page-export-section');
    expect(section.textContent).toContain('Export');
    expect(section.textContent).toContain('Select a layer to export');
  });
});
