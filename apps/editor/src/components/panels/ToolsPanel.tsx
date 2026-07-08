import { useNavigate } from 'react-router-dom';
import { Code2, FileDown, Upload } from 'lucide-react';
import type { OpenDoc } from '@openmake/core';
import { buildDesignContext } from '@openmake/ai/context-builder';
import { getGenerator } from '@openmake/codegen';
import { useSelectionStore } from '../../store/selection.js';

export interface ToolsPanelProps {
  doc: OpenDoc;
  onExportPNG: (nodeId: string, scale: 1 | 2) => void;
  onExportSVG: (nodeId: string) => void;
}

/**
 * Surfaces existing editor utilities against the current selection: copy
 * generated HTML/CSS to the clipboard, fire the shared PNG/SVG export paths,
 * and jump to the dashboard's import flow. It owns no document/import logic of
 * its own — every action reuses machinery built by earlier tasks.
 */
export function ToolsPanel({ doc, onExportPNG, onExportSVG }: ToolsPanelProps) {
  const navigate = useNavigate();
  const selectedIds = useSelectionStore((s) => s.selectedIds);
  const selectedId = selectedIds[0];

  const copyCode = () => {
    if (!selectedId) return;
    const ctx = buildDesignContext(doc, [selectedId]);
    const files = getGenerator('HTML_CSS').generate(ctx);
    const code = files.map((f) => f.content).join('\n\n');
    // Clipboard is absent in some environments (tests, insecure contexts); guard it.
    void navigator.clipboard?.writeText(code);
  };

  return (
    <div
      className="flex w-panel-left shrink-0 flex-col border-r bg-panel border-app"
      data-testid="tools-panel"
    >
      <div className="flex-1 overflow-y-auto p-2">
        <div className="mb-1 px-1 text-xs font-medium text-secondary-app">Tools</div>

        <section className="mb-3">
          <div className="mb-1 px-1 text-[11px] uppercase tracking-wide text-secondary-app">
            Code
          </div>
          <button
            type="button"
            data-testid="tools-copy-code"
            disabled={!selectedId}
            className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-xs bg-hover-app disabled:opacity-40"
            onClick={copyCode}
          >
            <Code2 size={14} strokeWidth={1.75} className="shrink-0 text-secondary-app" />
            Copy code
          </button>
          {!selectedId && (
            <div className="mt-1 px-1 text-[11px] text-secondary-app">
              Select a layer to generate its HTML/CSS.
            </div>
          )}
        </section>

        <section className="mb-3">
          <div className="mb-1 px-1 text-[11px] uppercase tracking-wide text-secondary-app">
            Export
          </div>
          <div className="flex gap-1">
            <button
              type="button"
              data-testid="tools-export-png"
              disabled={!selectedId}
              className="flex-1 rounded py-1 text-xs bg-hover-app disabled:opacity-40"
              onClick={() => selectedId && onExportPNG(selectedId, 1)}
            >
              PNG
            </button>
            <button
              type="button"
              data-testid="tools-export-png-2x"
              disabled={!selectedId}
              className="flex-1 rounded py-1 text-xs bg-hover-app disabled:opacity-40"
              onClick={() => selectedId && onExportPNG(selectedId, 2)}
            >
              PNG 2x
            </button>
            <button
              type="button"
              data-testid="tools-export-svg"
              disabled={!selectedId}
              className="flex-1 rounded py-1 text-xs bg-hover-app disabled:opacity-40"
              onClick={() => selectedId && onExportSVG(selectedId)}
            >
              SVG
            </button>
          </div>
          <FileDownHint hasSelection={!!selectedId} />
        </section>

        <section>
          <div className="mb-1 px-1 text-[11px] uppercase tracking-wide text-secondary-app">
            Import
          </div>
          <div className="mb-1 px-1 text-[11px] text-secondary-app">
            Bring in a Figma file or image from the dashboard.
          </div>
          <button
            type="button"
            data-testid="tools-import"
            className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-xs bg-hover-app"
            onClick={() => navigate('/')}
          >
            <Upload size={14} strokeWidth={1.75} className="shrink-0 text-secondary-app" />
            Go to import
          </button>
        </section>
      </div>
    </div>
  );
}

function FileDownHint({ hasSelection }: { hasSelection: boolean }) {
  if (hasSelection) return null;
  return (
    <div className="mt-1 flex items-center gap-1 px-1 text-[11px] text-secondary-app">
      <FileDown size={12} strokeWidth={1.75} className="shrink-0" />
      Select a layer to export it.
    </div>
  );
}
