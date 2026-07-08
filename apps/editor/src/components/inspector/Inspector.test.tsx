import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { OpenDoc } from '@openmake/core';
import { Inspector } from './Inspector.js';
import { useSelectionStore } from '../../store/selection.js';

const noop = () => {};

afterEach(() => {
  useSelectionStore.setState({ selectedIds: [] });
});

function makeDoc() {
  const doc = OpenDoc.create();
  const pageId = doc.getPages()[0]!;
  return { doc, pageId };
}

describe('Inspector right-panel header', () => {
  it('shows the Design/Prototype + zoom header when nothing is selected (page state)', () => {
    const { doc, pageId } = makeDoc();
    render(<Inspector doc={doc} pageId={pageId} onExportPNG={noop} onExportSVG={noop} />);

    expect(screen.getByTestId('right-panel-header')).toBeTruthy();
    expect(screen.getByTestId('panel-mode-design')).toBeTruthy();
    expect(screen.getByTestId('zoom-menu-trigger')).toBeTruthy();
    // Page inspector body renders below the header.
    expect(screen.getByTestId('page-inspector')).toBeTruthy();
  });

  it('shows the header at the top of the column when a node is selected', () => {
    const { doc, pageId } = makeDoc();
    const rectId = doc.createNode({
      type: 'RECTANGLE',
      parentId: pageId,
      x: 0,
      y: 0,
      width: 10,
      height: 10,
    });
    useSelectionStore.setState({ selectedIds: [rectId] });

    render(<Inspector doc={doc} pageId={pageId} onExportPNG={noop} onExportSVG={noop} />);

    const inspector = screen.getByTestId('inspector');
    const header = screen.getByTestId('right-panel-header');
    expect(inspector.firstElementChild).toBe(header);
    expect(screen.getByTestId('inspector-body')).toBeTruthy();
  });
});
