import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OpenDoc } from '@openmake/core';
import { LayersTree } from './LayersTree.js';
import { useSelectionStore } from '../../store/selection.js';

afterEach(() => {
  useSelectionStore.setState({ selectedIds: [] });
});

function setup() {
  const doc = OpenDoc.create();
  const pageId = doc.getPages()[0]!;
  const rectId = doc.createNode({ type: 'RECTANGLE', parentId: pageId, name: 'My Rect', x: 0, y: 0, width: 10, height: 10 });
  return { doc, pageId, rectId };
}

describe('LayersTree', () => {
  it('renders node names from the document', () => {
    const { doc, pageId } = setup();
    render(<LayersTree doc={doc} pageId={pageId} />);
    expect(screen.getByText('My Rect')).toBeTruthy();
  });

  it('clicking the visibility toggle calls updateNode with the flipped value', () => {
    const { doc, pageId, rectId } = setup();
    const updateSpy = vi.spyOn(doc, 'updateNode');
    render(<LayersTree doc={doc} pageId={pageId} />);

    fireEvent.click(screen.getByTestId(`layer-visibility-${rectId}`));

    expect(updateSpy).toHaveBeenCalledWith(rectId, { visible: false });
  });

  it('clicking a layer row selects it in the selection store', () => {
    const { doc, pageId, rectId } = setup();
    render(<LayersTree doc={doc} pageId={pageId} />);

    fireEvent.click(screen.getByTestId(`layer-row-${rectId}`));

    expect(useSelectionStore.getState().selectedIds).toEqual([rectId]);
  });
});
