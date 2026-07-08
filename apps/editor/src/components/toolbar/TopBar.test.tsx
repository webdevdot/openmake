import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OpenDoc } from '@openmake/core';
import { TopBar } from './TopBar.js';

afterEach(() => {
  vi.restoreAllMocks();
});

const noop = () => {};

describe('TopBar', () => {
  it('renders the document name', () => {
    const doc = OpenDoc.create({ name: 'My Design' });
    render(
      <TopBar
        doc={doc}
        status="connected"
        onExportPNG={noop}
        onExportSVG={noop}
        onPresent={noop}
      />,
    );
    expect(screen.getByText('My Design')).toBeTruthy();
  });

  it('disables undo and redo on a fresh document with no history', () => {
    const doc = OpenDoc.create();
    render(
      <TopBar
        doc={doc}
        status="connected"
        onExportPNG={noop}
        onExportSVG={noop}
        onPresent={noop}
      />,
    );
    expect((screen.getByTestId('undo-button') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId('redo-button') as HTMLButtonElement).disabled).toBe(true);
  });

  it('undo/redo disabled state tracks doc.canUndo/doc.canRedo', () => {
    const doc = OpenDoc.create();
    vi.spyOn(doc, 'canUndo').mockReturnValue(true);
    vi.spyOn(doc, 'canRedo').mockReturnValue(false);
    render(
      <TopBar
        doc={doc}
        status="connected"
        onExportPNG={noop}
        onExportSVG={noop}
        onPresent={noop}
      />,
    );
    expect((screen.getByTestId('undo-button') as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByTestId('redo-button') as HTMLButtonElement).disabled).toBe(true);
  });

  it('renders the disabled Share button with a neutral background, not the CTA accent', () => {
    const doc = OpenDoc.create();
    render(
      <TopBar
        doc={doc}
        status="connected"
        onExportPNG={noop}
        onExportSVG={noop}
        onPresent={noop}
      />,
    );
    const shareButton = screen.getByText('Share').closest('button') as HTMLButtonElement;
    expect(shareButton.disabled).toBe(true);
    expect(shareButton.className).not.toContain('bg-accent-cta');
    expect(shareButton.className).toContain('bg-hover-app');
  });

  it('clicking the present button fires onPresent', () => {
    const doc = OpenDoc.create();
    const onPresent = vi.fn();
    render(
      <TopBar
        doc={doc}
        status="connected"
        onExportPNG={noop}
        onExportSVG={noop}
        onPresent={onPresent}
      />,
    );

    fireEvent.click(screen.getByTestId('present-button'));

    expect(onPresent).toHaveBeenCalledTimes(1);
  });

  it('no longer hosts the zoom menu or Design/Prototype tabs (moved to right panel)', () => {
    const doc = OpenDoc.create();
    render(
      <TopBar
        doc={doc}
        status="connected"
        onExportPNG={noop}
        onExportSVG={noop}
        onPresent={noop}
      />,
    );
    expect(screen.queryByTestId('zoom-menu-trigger')).toBeNull();
    expect(screen.queryByText('Prototype')).toBeNull();
  });

  it('renders collab-status text per status prop', () => {
    const doc = OpenDoc.create();
    const { rerender } = render(
      <TopBar
        doc={doc}
        status="connecting"
        onExportPNG={noop}
        onExportSVG={noop}
        onPresent={noop}
      />,
    );
    expect(screen.getByTestId('collab-status').textContent).toBe('Connecting…');

    rerender(
      <TopBar
        doc={doc}
        status="connected"
        onExportPNG={noop}
        onExportSVG={noop}
        onPresent={noop}
      />,
    );
    expect(screen.getByTestId('collab-status').textContent).toBe('Connected');

    rerender(
      <TopBar doc={doc} status="offline" onExportPNG={noop} onExportSVG={noop} onPresent={noop} />,
    );
    expect(screen.getByTestId('collab-status').textContent).toBe('Offline');
  });
});
