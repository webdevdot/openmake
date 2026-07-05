import type { OpenDoc } from '@openmake/core';
import type { AutoLayout, SceneNode } from '@openmake/shared';

export interface AutoLayoutSectionProps {
  doc: OpenDoc;
  node: Extract<SceneNode, { autoLayout?: AutoLayout }>;
}

const DEFAULT_AUTO_LAYOUT: AutoLayout = {
  mode: 'VERTICAL',
  gap: 8,
  paddingTop: 8,
  paddingRight: 8,
  paddingBottom: 8,
  paddingLeft: 8,
  alignItems: 'MIN',
  justifyContent: 'MIN',
  wrap: false,
};

const ALIGN_GRID: Array<{ align: AutoLayout['alignItems']; justify: AutoLayout['justifyContent'] }> = [
  { align: 'MIN', justify: 'MIN' },
  { align: 'CENTER', justify: 'MIN' },
  { align: 'MAX', justify: 'MIN' },
  { align: 'MIN', justify: 'CENTER' },
  { align: 'CENTER', justify: 'CENTER' },
  { align: 'MAX', justify: 'CENTER' },
  { align: 'MIN', justify: 'MAX' },
  { align: 'CENTER', justify: 'MAX' },
  { align: 'MAX', justify: 'MAX' },
];

export function AutoLayoutSection({ doc, node }: AutoLayoutSectionProps) {
  const autoLayout = node.autoLayout;

  const commit = (patch: Partial<AutoLayout>) => {
    doc.updateNode(node.id, { autoLayout: { ...(autoLayout ?? DEFAULT_AUTO_LAYOUT), ...patch } });
    doc.commitUndoGroup();
  };

  const toggle = (enabled: boolean) => {
    doc.updateNode(node.id, { autoLayout: enabled ? DEFAULT_AUTO_LAYOUT : undefined });
    doc.commitUndoGroup();
  };

  return (
    <div className="border-b p-2 border-app" data-testid="auto-layout-section">
      <label className="mb-1 flex items-center justify-between text-xs font-medium text-secondary-app">
        <span>Auto layout</span>
        <input
          type="checkbox"
          data-testid="auto-layout-toggle"
          checked={!!autoLayout}
          onChange={(e) => toggle(e.target.checked)}
        />
      </label>

      {autoLayout && (
        <div className="flex flex-col gap-2">
          <div className="flex gap-1">
            <button
              type="button"
              data-testid="auto-layout-direction-horizontal"
              className="flex-1 rounded border py-0.5 text-xs bg-hover-app border-app"
              style={autoLayout.mode === 'HORIZONTAL' ? { backgroundColor: 'var(--bg-active)' } : undefined}
              onClick={() => commit({ mode: 'HORIZONTAL' })}
            >
              Horizontal
            </button>
            <button
              type="button"
              data-testid="auto-layout-direction-vertical"
              className="flex-1 rounded border py-0.5 text-xs bg-hover-app border-app"
              style={autoLayout.mode === 'VERTICAL' ? { backgroundColor: 'var(--bg-active)' } : undefined}
              onClick={() => commit({ mode: 'VERTICAL' })}
            >
              Vertical
            </button>
          </div>

          <label className="flex items-center gap-1 text-xs">
            <span className="w-14 text-secondary-app">Gap</span>
            <input
              type="number"
              min={0}
              data-testid="auto-layout-gap-input"
              className="w-full rounded border bg-transparent px-1 py-0.5 border-app"
              value={autoLayout.gap}
              onChange={(e) => commit({ gap: Math.max(0, Number(e.target.value)) })}
            />
          </label>

          <label className="flex items-center gap-1 text-xs">
            <span className="w-14 text-secondary-app">Padding</span>
            <input
              type="number"
              min={0}
              data-testid="auto-layout-padding-input"
              className="w-full rounded border bg-transparent px-1 py-0.5 border-app"
              value={autoLayout.paddingTop}
              onChange={(e) => {
                const v = Math.max(0, Number(e.target.value));
                commit({ paddingTop: v, paddingRight: v, paddingBottom: v, paddingLeft: v });
              }}
            />
          </label>

          <div>
            <span className="mb-1 block text-xs text-secondary-app">Align</span>
            <div className="grid w-fit grid-cols-3 gap-0.5 rounded border p-1 border-app">
              {ALIGN_GRID.map(({ align, justify }) => (
                <button
                  key={`${align}-${justify}`}
                  type="button"
                  data-testid={`align-${align}-${justify}`}
                  className="h-4 w-4 rounded-sm bg-hover-app"
                  style={
                    autoLayout.alignItems === align && autoLayout.justifyContent === justify
                      ? { backgroundColor: 'var(--color-accent)' }
                      : { backgroundColor: 'var(--bg-active)' }
                  }
                  onClick={() => commit({ alignItems: align, justifyContent: justify })}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
