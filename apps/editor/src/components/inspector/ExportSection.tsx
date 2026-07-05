export interface ExportSectionProps {
  onExportPNG: (scale: 1 | 2) => void;
  onExportSVG: () => void;
}

export function ExportSection({ onExportPNG, onExportSVG }: ExportSectionProps) {
  return (
    <div className="p-2" data-testid="export-section">
      <span className="mb-1 block text-xs font-medium text-secondary-app">Export</span>
      <div className="flex gap-1">
        <button type="button" data-testid="export-png-1x" className="flex-1 rounded py-1 text-xs bg-hover-app" onClick={() => onExportPNG(1)}>
          PNG 1x
        </button>
        <button type="button" data-testid="export-png-2x" className="flex-1 rounded py-1 text-xs bg-hover-app" onClick={() => onExportPNG(2)}>
          PNG 2x
        </button>
        <button type="button" data-testid="export-svg" className="flex-1 rounded py-1 text-xs bg-hover-app" onClick={onExportSVG}>
          SVG
        </button>
      </div>
    </div>
  );
}
