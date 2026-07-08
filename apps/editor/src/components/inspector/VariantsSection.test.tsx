import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OpenDoc } from '@openmake/core';
import { VariantsSection } from './VariantsSection.js';
import { useSelectionStore } from '../../store/selection.js';

afterEach(() => {
  useSelectionStore.setState({ selectedIds: [] });
});

function component(doc: OpenDoc, parentId: string, name: string, x = 0, y = 0): string {
  const id = doc.createNode({ type: 'FRAME', parentId, name, x, y, width: 40, height: 40 });
  doc.createComponentFromNode(id);
  return id;
}

describe('VariantsSection', () => {
  it('combines two selected components into a COMPONENT_SET and selects it', () => {
    const doc = OpenDoc.create();
    const pageId = doc.getPages()[0]!;
    const a = component(doc, pageId, 'State=default', 0, 0);
    const b = component(doc, pageId, 'State=hover', 60, 0);
    const combineSpy = vi.spyOn(doc, 'combineAsVariants');

    render(<VariantsSection doc={doc} selectedIds={[a, b]} />);
    fireEvent.click(screen.getByTestId('combine-variants-button'));

    expect(combineSpy).toHaveBeenCalledWith([a, b]);
    const setId = combineSpy.mock.results[0]!.value as string;
    expect(doc.getNode(setId)!.type).toBe('COMPONENT_SET');
    expect(doc.getChildrenIds(setId)).toEqual([a, b]);
    expect(useSelectionStore.getState().selectedIds).toEqual([setId]);
  });

  it('renders nothing unless >= 2 components are selected', () => {
    const doc = OpenDoc.create();
    const pageId = doc.getPages()[0]!;
    const a = component(doc, pageId, 'State=default');
    const rect = doc.createNode({ type: 'RECTANGLE', parentId: pageId, x: 60, y: 0 });

    const { container: single } = render(<VariantsSection doc={doc} selectedIds={[a]} />);
    expect(single.querySelector('[data-testid="variants-section"]')).toBeNull();

    const { container: mixed } = render(<VariantsSection doc={doc} selectedIds={[a, rect]} />);
    expect(mixed.querySelector('[data-testid="variants-section"]')).toBeNull();
  });
});
