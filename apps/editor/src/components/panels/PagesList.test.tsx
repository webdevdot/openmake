import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OpenDoc } from '@openmake/core';
import { PagesList } from './PagesList.js';

function setup() {
  const doc = OpenDoc.create();
  const homeId = doc.getPages()[0]!;
  doc.updateNode(homeId, { name: 'Home' });
  const aboutId = doc.createNode({ type: 'PAGE', parentId: doc.rootId, name: 'About' });
  doc.commitUndoGroup();
  return { doc, homeId, aboutId };
}

describe('PagesList', () => {
  it('renders all pages when the search query is empty', () => {
    const { doc, homeId, aboutId } = setup();
    render(<PagesList doc={doc} activePageId={homeId} onSelectPage={vi.fn()} />);

    expect(screen.getByTestId(`page-${homeId}`)).toBeTruthy();
    expect(screen.getByTestId(`page-${aboutId}`)).toBeTruthy();
  });

  it('live-filters pages by case-insensitive substring', () => {
    const { doc, homeId, aboutId } = setup();
    render(<PagesList doc={doc} activePageId={homeId} onSelectPage={vi.fn()} />);

    fireEvent.change(screen.getByTestId('pages-search'), { target: { value: 'aBo' } });

    expect(screen.queryByTestId(`page-${homeId}`)).toBeNull();
    expect(screen.getByTestId(`page-${aboutId}`)).toBeTruthy();

    fireEvent.change(screen.getByTestId('pages-search'), { target: { value: '' } });

    expect(screen.getByTestId(`page-${homeId}`)).toBeTruthy();
  });

  it('adds a page via the add-page button', () => {
    const { doc, homeId } = setup();
    const onSelectPage = vi.fn();
    render(<PagesList doc={doc} activePageId={homeId} onSelectPage={onSelectPage} />);

    fireEvent.click(screen.getByTestId('add-page-button'));

    expect(doc.getPages()).toHaveLength(3);
    expect(onSelectPage).toHaveBeenCalledWith(doc.getPages()[2]);
  });
});
