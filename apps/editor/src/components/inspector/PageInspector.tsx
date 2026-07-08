import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import type { OpenDoc } from '@openmake/core';
import type { PageNode } from '@openmake/shared';
import { colorToHex, hexToColor } from '../../lib/color.js';

export interface PageInspectorProps {
  doc: OpenDoc;
  page: PageNode;
}

/**
 * Right-panel view shown when nothing is selected: page background + the
 * document's shared text styles. Read-only style list — creating/editing
 * styles is separate feature work (deprioritized vs. vector tools).
 */
export function PageInspector({ doc, page }: PageInspectorProps) {
  const styles = Object.values(doc.getStyles()).filter((s) => s.type === 'TEXT');
  const backgroundHex = colorToHex(page.backgroundColor).slice(1).toUpperCase();
  const [hexDraft, setHexDraft] = useState(backgroundHex);

  useEffect(() => {
    setHexDraft(backgroundHex);
  }, [page.id, backgroundHex]);

  const setBackground = (hex: string) => {
    const color = hexToColor(hex);
    if (!color) return;
    doc.updateNode(page.id, { backgroundColor: { ...color, a: page.backgroundColor.a } });
    doc.commitUndoGroup();
  };

  const commitHexDraft = () => {
    const color = hexToColor(hexDraft);
    if (!color) {
      setHexDraft(backgroundHex);
      return;
    }
    setBackground(hexDraft);
    setHexDraft(colorToHex(color).slice(1).toUpperCase());
  };

  return (
    <div
      className="flex w-panel-right shrink-0 flex-col overflow-y-auto border-l bg-panel border-app"
      data-testid="page-inspector"
    >
      <div className="border-b p-2 border-app">
        <span className="text-xs font-medium text-secondary-app">Page</span>
        <div className="mt-1 flex items-center gap-1">
          <input
            type="color"
            data-testid="page-background-swatch"
            className="h-5 w-5 shrink-0 rounded border p-0 border-app"
            value={colorToHex(page.backgroundColor)}
            onChange={(e) => setBackground(e.target.value)}
          />
          <input
            type="text"
            data-testid="page-background-hex"
            className="w-20 rounded border bg-transparent px-1 py-0.5 text-xs border-app"
            value={hexDraft}
            onChange={(e) => setHexDraft(e.target.value)}
            onBlur={commitHexDraft}
            onKeyDown={(e) => e.key === 'Enter' && commitHexDraft()}
          />
          <input
            type="number"
            min={0}
            max={100}
            data-testid="page-background-alpha"
            className="w-12 rounded border bg-transparent px-1 py-0.5 text-xs border-app"
            value={Math.round(page.backgroundColor.a * 100)}
            onChange={(e) =>
              doc.updateNode(page.id, {
                backgroundColor: { ...page.backgroundColor, a: Number(e.target.value) / 100 },
              })
            }
            onBlur={() => doc.commitUndoGroup()}
          />
        </div>
      </div>

      <div className="border-b p-2 border-app">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-xs font-medium text-secondary-app">Styles</span>
          <button type="button" disabled title="Coming soon" className="text-secondary-app">
            <Plus size={14} strokeWidth={1.75} />
          </button>
        </div>
        {styles.length === 0 ? (
          <p className="text-xs text-secondary-app">No text styles yet.</p>
        ) : (
          <ul data-testid="text-styles-list">
            {styles.map((s) => (
              <li
                key={s.id}
                className="rounded px-1 py-1 text-xs bg-hover-app"
                data-testid={`style-${s.id}`}
              >
                {s.name}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="border-b p-2 border-app" data-testid="page-export-section">
        <span className="text-xs font-medium text-secondary-app">Export</span>
        <p className="mt-1 text-xs text-secondary-app">Select a layer to export</p>
      </div>
    </div>
  );
}
