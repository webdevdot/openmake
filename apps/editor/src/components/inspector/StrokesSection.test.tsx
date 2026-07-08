import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OpenDoc } from '@openmake/core';
import { StrokesSection } from './StrokesSection.js';

function makeNode() {
  const doc = OpenDoc.create();
  const pageId = doc.getPages()[0]!;
  const rectId = doc.createNode({
    type: 'RECTANGLE',
    parentId: pageId,
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    strokes: [
      {
        paint: { type: 'SOLID', color: { r: 0, g: 0, b: 0, a: 1 }, opacity: 1, visible: true },
        weight: 1,
        align: 'INSIDE' as const,
      },
    ],
  });
  const node = doc.getNode(rectId) as Extract<
    ReturnType<typeof doc.getNode>,
    { strokes: unknown[] }
  >;
  return { doc, rectId, node };
}

describe('StrokesSection', () => {
  it('add stroke button appends a new stroke and has an accessible name', () => {
    const { doc, rectId } = makeNode();
    const empty = doc.getNode(rectId)!;
    const updateSpy = vi.spyOn(doc, 'updateNode');

    render(
      <StrokesSection
        doc={doc}
        node={{ ...empty, strokes: [] } as unknown as Extract<
          ReturnType<typeof doc.getNode>,
          { strokes: unknown[] }
        >}
      />,
    );

    const addButton = screen.getByTestId('add-stroke-button');
    expect(addButton.getAttribute('aria-label')).toBe('Add stroke');

    fireEvent.click(addButton);
    expect(updateSpy).toHaveBeenCalledWith(rectId, {
      strokes: [expect.objectContaining({ weight: 1 })],
    });
  });

  it('remove stroke button has an accessible name and removes the stroke', () => {
    const { doc, rectId, node } = makeNode();
    const updateSpy = vi.spyOn(doc, 'updateNode');

    render(<StrokesSection doc={doc} node={node} />);

    const removeButton = screen.getByTestId('remove-stroke-button');
    expect(removeButton.getAttribute('aria-label')).toBe('Remove stroke');

    fireEvent.click(removeButton);
    expect(updateSpy).toHaveBeenCalledWith(rectId, { strokes: [] });
  });
});
