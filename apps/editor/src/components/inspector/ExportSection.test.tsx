import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ExportSection } from './ExportSection.js';

describe('ExportSection', () => {
  it('disables the buttons and shows "Exporting…" while the export promise is in flight', async () => {
    let resolveExport: () => void = () => {};
    const onExportPNG = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveExport = resolve;
        }),
    );
    const onExportSVG = vi.fn();

    render(<ExportSection onExportPNG={onExportPNG} onExportSVG={onExportSVG} />);

    fireEvent.click(screen.getByTestId('export-png-1x'));

    expect(screen.getByTestId('export-png-1x').textContent).toBe('Exporting…');
    expect((screen.getByTestId('export-png-1x') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId('export-png-2x') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId('export-svg') as HTMLButtonElement).disabled).toBe(true);

    resolveExport();

    await waitFor(() => {
      expect((screen.getByTestId('export-png-1x') as HTMLButtonElement).disabled).toBe(false);
    });
    expect(screen.getByTestId('export-png-1x').textContent).toBe('PNG 1x');
  });

  it('shows an inline error message when the export promise rejects', async () => {
    const onExportPNG = vi.fn(() => Promise.reject(new Error('render failed')));
    const onExportSVG = vi.fn();

    render(<ExportSection onExportPNG={onExportPNG} onExportSVG={onExportSVG} />);

    fireEvent.click(screen.getByTestId('export-png-2x'));

    await waitFor(() => {
      expect(screen.getByTestId('export-error')).toBeTruthy();
    });
    expect((screen.getByTestId('export-png-2x') as HTMLButtonElement).disabled).toBe(false);
  });

  it('clears a prior error on the next successful export', async () => {
    const onExportPNG = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(undefined);
    const onExportSVG = vi.fn();

    render(<ExportSection onExportPNG={onExportPNG} onExportSVG={onExportSVG} />);

    fireEvent.click(screen.getByTestId('export-png-1x'));
    await waitFor(() => expect(screen.getByTestId('export-error')).toBeTruthy());

    fireEvent.click(screen.getByTestId('export-png-1x'));
    await waitFor(() => {
      expect(screen.queryByTestId('export-error')).toBeFalsy();
    });
  });

  it('calls onExportSVG when the SVG button is clicked', () => {
    const onExportPNG = vi.fn();
    const onExportSVG = vi.fn();

    render(<ExportSection onExportPNG={onExportPNG} onExportSVG={onExportSVG} />);
    fireEvent.click(screen.getByTestId('export-svg'));

    expect(onExportSVG).toHaveBeenCalledTimes(1);
  });
});
