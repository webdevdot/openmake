import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OpenDoc } from '@openmake/core';
import { InteractionSection } from './InteractionSection.js';

describe('InteractionSection', () => {
  it('shows empty-state helper text and disables the destination select when no frames exist', () => {
    const doc = OpenDoc.create();
    const pageId = doc.getPages()[0]!;
    const rectId = doc.createNode({
      type: 'RECTANGLE',
      parentId: pageId,
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      reactions: [
        {
          trigger: 'ON_CLICK' as const,
          action: { type: 'NAVIGATE' as const, transition: { type: 'INSTANT' as const, durationMs: 300 } },
        },
      ],
    });
    const node = doc.getNode(rectId)!;

    render(<InteractionSection doc={doc} node={node} pageId={pageId} />);

    expect(screen.getByTestId('no-destinations-hint').textContent).toMatch(
      /No frames available/,
    );
    expect(
      (screen.getByTestId('interaction-destination-select') as HTMLSelectElement).disabled,
    ).toBe(true);
  });

  it('does not show empty-state helper text when destination frames exist', () => {
    const doc = OpenDoc.create();
    const pageId = doc.getPages()[0]!;
    doc.createNode({ type: 'FRAME', parentId: pageId, x: 0, y: 0, width: 100, height: 100 });
    const rectId = doc.createNode({
      type: 'RECTANGLE',
      parentId: pageId,
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      reactions: [
        {
          trigger: 'ON_CLICK' as const,
          action: { type: 'NAVIGATE' as const, transition: { type: 'INSTANT' as const, durationMs: 300 } },
        },
      ],
    });
    const node = doc.getNode(rectId)!;

    render(<InteractionSection doc={doc} node={node} pageId={pageId} />);

    expect(screen.queryByTestId('no-destinations-hint')).toBeFalsy();
    expect(
      (screen.getByTestId('interaction-destination-select') as HTMLSelectElement).disabled,
    ).toBe(false);
  });

  it('add/remove interaction buttons expose accessible names', () => {
    const doc = OpenDoc.create();
    const pageId = doc.getPages()[0]!;
    const rectId = doc.createNode({
      type: 'RECTANGLE',
      parentId: pageId,
      x: 0,
      y: 0,
      width: 10,
      height: 10,
    });
    const node = doc.getNode(rectId)!;
    const updateSpy = vi.spyOn(doc, 'updateNode');

    render(<InteractionSection doc={doc} node={node} pageId={pageId} />);

    const addButton = screen.getByTestId('add-interaction-button');
    expect(addButton.getAttribute('aria-label')).toBe('Add interaction');

    fireEvent.click(addButton);
    expect(updateSpy).toHaveBeenCalledWith(
      rectId,
      expect.objectContaining({ reactions: [expect.anything()] }),
    );
  });
});
