import { useState } from 'react';

export interface ExportSectionProps {
  onExportPNG: (scale: 1 | 2) => void | Promise<void>;
  onExportSVG: () => void | Promise<void>;
}

type ExportKind = 'png1x' | 'png2x' | 'svg';

/**
 * Export actions have no visible contract with the caller's async work —
 * `onExportPNG`/`onExportSVG` may reject (renderer failure, etc.) and the
 * buttons would otherwise stay clickable with zero feedback either way.
 * This wraps each call site with a local pending/error state; it does not
 * change the export functions' own signatures or behavior.
 */
export function ExportSection({ onExportPNG, onExportSVG }: ExportSectionProps) {
  const [pending, setPending] = useState<ExportKind | null>(null);
  const [error, setError] = useState<ExportKind | null>(null);

  const run = async (kind: ExportKind, action: () => void | Promise<void>) => {
    setPending(kind);
    setError(null);
    try {
      await action();
    } catch {
      setError(kind);
    } finally {
      setPending(null);
    }
  };

  const isBusy = pending !== null;

  return (
    <div className="p-2" data-testid="export-section">
      <span className="mb-1 block text-xs font-medium text-secondary-app">Export</span>
      <div className="flex gap-1">
        <button
          type="button"
          data-testid="export-png-1x"
          className="flex-1 rounded py-1 text-xs bg-hover-app disabled:opacity-50"
          disabled={isBusy}
          onClick={() => run('png1x', () => onExportPNG(1))}
        >
          {pending === 'png1x' ? 'Exporting…' : 'PNG 1x'}
        </button>
        <button
          type="button"
          data-testid="export-png-2x"
          className="flex-1 rounded py-1 text-xs bg-hover-app disabled:opacity-50"
          disabled={isBusy}
          onClick={() => run('png2x', () => onExportPNG(2))}
        >
          {pending === 'png2x' ? 'Exporting…' : 'PNG 2x'}
        </button>
        <button
          type="button"
          data-testid="export-svg"
          className="flex-1 rounded py-1 text-xs bg-hover-app disabled:opacity-50"
          disabled={isBusy}
          onClick={() => run('svg', () => onExportSVG())}
        >
          {pending === 'svg' ? 'Exporting…' : 'SVG'}
        </button>
      </div>
      {error && (
        <p className="mt-1 text-xs text-red-500" role="alert" data-testid="export-error">
          Export failed. Please try again.
        </p>
      )}
    </div>
  );
}
