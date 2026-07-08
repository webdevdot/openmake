import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OpenDoc } from '@openmake/core';
import { AssetsPanel } from './AssetsPanel.js';
import { useSelectionStore } from '../../store/selection.js';

afterEach(() => {
  useSelectionStore.setState({ selectedIds: [] });
});

/** Create a COMPONENT on `parentId` (via a FRAME promoted to a component). */
function component(doc: OpenDoc, parentId: string, name: string, x = 0, y = 0): string {
  const id = doc.createNode({ type: 'FRAME', parentId, name, x, y, width: 40, height: 40 });
  doc.createComponentFromNode(id);
  return id;
}

const center = () => ({ x: 500, y: 300 });

describe('AssetsPanel', () => {
  it('lists standalone components and a set with its variants; empty state otherwise', () => {
    const doc = OpenDoc.create();
    const pageId = doc.getPages()[0]!;

    // Empty state first.
    const { unmount } = render(
      <AssetsPanel doc={doc} activePageId={pageId} getViewportCenter={center} />,
    );
    expect(screen.getByTestId('assets-empty').textContent).toContain('No components yet');
    unmount();

    const solo = component(doc, pageId, 'Card', 0, 0);
    const a = component(doc, pageId, 'State=default', 0, 200);
    const b = component(doc, pageId, 'State=hover', 60, 200);
    const setId = doc.combineAsVariants([a, b]);
    doc.commitUndoGroup();

    render(<AssetsPanel doc={doc} activePageId={pageId} getViewportCenter={center} />);

    expect(screen.getByTestId(`asset-component-${solo}`)).toBeTruthy();
    expect(screen.getByTestId(`asset-set-${setId}`)).toBeTruthy();
    // Both variants appear under the set, labelled by their variant props.
    expect(screen.getByTestId(`asset-variant-${a}`).textContent).toContain('State=default');
    expect(screen.getByTestId(`asset-variant-${b}`).textContent).toContain('State=hover');
  });

  it('walks components across all pages', () => {
    const doc = OpenDoc.create();
    const page1 = doc.getPages()[0]!;
    const page2 = doc.createNode({ type: 'PAGE', parentId: doc.rootId, name: 'Page 2' });
    const c1 = component(doc, page1, 'OnPage1');
    const c2 = component(doc, page2, 'OnPage2');
    doc.commitUndoGroup();

    render(<AssetsPanel doc={doc} activePageId={page1} getViewportCenter={center} />);
    expect(screen.getByTestId(`asset-component-${c1}`)).toBeTruthy();
    expect(screen.getByTestId(`asset-component-${c2}`)).toBeTruthy();
  });

  it('filters by name (case-insensitive substring)', () => {
    const doc = OpenDoc.create();
    const pageId = doc.getPages()[0]!;
    const card = component(doc, pageId, 'Card', 0, 0);
    const button = component(doc, pageId, 'Button', 100, 0);
    doc.commitUndoGroup();

    render(<AssetsPanel doc={doc} activePageId={pageId} getViewportCenter={center} />);
    fireEvent.change(screen.getByTestId('assets-search'), { target: { value: 'car' } });

    expect(screen.getByTestId(`asset-component-${card}`)).toBeTruthy();
    expect(screen.queryByTestId(`asset-component-${button}`)).toBeNull();
  });

  it('clicking a component inserts an INSTANCE at the viewport center and selects it', () => {
    const doc = OpenDoc.create();
    const pageId = doc.getPages()[0]!;
    const compId = component(doc, pageId, 'Card', 0, 0);
    doc.commitUndoGroup();
    const createSpy = vi.spyOn(doc, 'createInstance');

    render(<AssetsPanel doc={doc} activePageId={pageId} getViewportCenter={center} />);
    fireEvent.click(screen.getByTestId(`asset-component-${compId}`));

    expect(createSpy).toHaveBeenCalledWith(compId, pageId, { x: 500, y: 300 });
    const instId = createSpy.mock.results[0]!.value as string;
    expect(doc.getNode(instId)!.type).toBe('INSTANCE');
    expect(useSelectionStore.getState().selectedIds).toEqual([instId]);
  });

  it('clicking a variant inserts an instance of that specific variant component', () => {
    const doc = OpenDoc.create();
    const pageId = doc.getPages()[0]!;
    const a = component(doc, pageId, 'State=default', 0, 0);
    const b = component(doc, pageId, 'State=hover', 60, 0);
    doc.combineAsVariants([a, b]);
    doc.commitUndoGroup();
    const createSpy = vi.spyOn(doc, 'createInstance');

    render(<AssetsPanel doc={doc} activePageId={pageId} getViewportCenter={center} />);
    fireEvent.click(screen.getByTestId(`asset-variant-${b}`));

    expect(createSpy).toHaveBeenCalledWith(b, pageId, { x: 500, y: 300 });
  });
});
