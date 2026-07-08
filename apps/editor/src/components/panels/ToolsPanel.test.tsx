import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OpenDoc } from '@openmake/core';
import { ToolsPanel } from './ToolsPanel.js';
import { useSelectionStore } from '../../store/selection.js';

// react-router's useNavigate is the only router surface ToolsPanel touches.
const navigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => navigate,
}));

function newDocWithRect() {
  const doc = OpenDoc.create();
  const pageId = doc.getPages()[0]!;
  const rectId = doc.createNode({
    type: 'RECTANGLE',
    parentId: pageId,
    x: 0,
    y: 0,
    width: 120,
    height: 40,
    name: 'Box',
  });
  return { doc, pageId, rectId };
}

afterEach(() => {
  useSelectionStore.setState({ selectedIds: [] });
  navigate.mockClear();
});

describe('ToolsPanel', () => {
  it('Copy code generates HTML/CSS for the selection and writes it to the clipboard', () => {
    const { doc, rectId } = newDocWithRect();
    useSelectionStore.setState({ selectedIds: [rectId] });
    const writeText = vi.fn();
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    render(
      <ToolsPanel
        doc={doc}
        onExportPNG={vi.fn()}
        onExportSVG={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId('tools-copy-code'));

    expect(writeText).toHaveBeenCalledTimes(1);
    const code = writeText.mock.calls[0]![0] as string;
    expect(code.length).toBeGreaterThan(0);
    // HTML_CSS generator emits markup; sanity-check it produced real output.
    expect(code).toMatch(/<|{/);

    vi.unstubAllGlobals();
  });

  it('Copy code is disabled and does nothing without a selection', () => {
    const { doc } = newDocWithRect();
    const writeText = vi.fn();
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    render(
      <ToolsPanel
        doc={doc}
        onExportPNG={vi.fn()}
        onExportSVG={vi.fn()}
      />,
    );
    const button = screen.getByTestId('tools-copy-code') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(writeText).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  it('Export PNG / PNG 2x / SVG buttons invoke the shared export handlers with the selected node', () => {
    const { doc, rectId } = newDocWithRect();
    useSelectionStore.setState({ selectedIds: [rectId] });
    const onExportPNG = vi.fn();
    const onExportSVG = vi.fn();

    render(
      <ToolsPanel
        doc={doc}
        onExportPNG={onExportPNG}
        onExportSVG={onExportSVG}
      />,
    );

    fireEvent.click(screen.getByTestId('tools-export-png'));
    expect(onExportPNG).toHaveBeenCalledWith(rectId, 1);

    fireEvent.click(screen.getByTestId('tools-export-png-2x'));
    expect(onExportPNG).toHaveBeenCalledWith(rectId, 2);

    fireEvent.click(screen.getByTestId('tools-export-svg'));
    expect(onExportSVG).toHaveBeenCalledWith(rectId);
  });

  it('Go to import navigates to the dashboard', () => {
    const { doc } = newDocWithRect();

    render(
      <ToolsPanel
        doc={doc}
        onExportPNG={vi.fn()}
        onExportSVG={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId('tools-import'));
    expect(navigate).toHaveBeenCalledWith('/');
  });
});
