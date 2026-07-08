import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OpenDoc } from '@openmake/core';
import { EffectsSection } from './EffectsSection.js';

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
    effects: [
      {
        type: 'DROP_SHADOW' as const,
        color: { r: 0, g: 0, b: 0, a: 0.25 },
        offset: { x: 0, y: 4 },
        blur: 8,
        spread: 0,
        visible: true,
      },
    ],
  });
  const node = doc.getNode(rectId) as Extract<
    ReturnType<typeof doc.getNode>,
    { effects: unknown[] }
  >;
  return { doc, rectId, node };
}

describe('EffectsSection', () => {
  it('add effect button has an accessible name and appends a drop shadow', () => {
    const { doc, rectId } = makeNode();
    const empty = doc.getNode(rectId)!;
    const updateSpy = vi.spyOn(doc, 'updateNode');

    render(
      <EffectsSection
        doc={doc}
        node={{ ...empty, effects: [] } as unknown as Extract<
          ReturnType<typeof doc.getNode>,
          { effects: unknown[] }
        >}
      />,
    );

    const addButton = screen.getByTestId('add-drop-shadow-button');
    expect(addButton.getAttribute('aria-label')).toBe('Add effect');

    fireEvent.click(addButton);
    expect(updateSpy).toHaveBeenCalledWith(rectId, {
      effects: [expect.objectContaining({ type: 'DROP_SHADOW' })],
    });
  });

  it('remove effect button has an accessible name and removes the effect', () => {
    const { doc, rectId, node } = makeNode();
    const updateSpy = vi.spyOn(doc, 'updateNode');

    render(<EffectsSection doc={doc} node={node} />);

    const removeButton = screen.getByTestId('remove-effect-button');
    expect(removeButton.getAttribute('aria-label')).toBe('Remove effect');

    fireEvent.click(removeButton);
    expect(updateSpy).toHaveBeenCalledWith(rectId, { effects: [] });
  });
});
