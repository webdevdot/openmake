import { ZoomMenu } from '../toolbar/ZoomMenu.js';
import { usePanelModeStore, type PanelMode } from '../../store/panelMode.js';

const TABS: Array<{ id: PanelMode; label: string }> = [
  { id: 'design', label: 'Design' },
  { id: 'prototype', label: 'Prototype' },
];

/**
 * Right-panel header (Figma UI3 pattern): the Design/Prototype tab pair sits
 * left-aligned with the zoom percentage dropdown right-aligned in the same
 * header row at the top of the inspector column. Relocated here from TopBar.
 */
export function RightPanelHeader() {
  const mode = usePanelModeStore((s) => s.mode);
  const setMode = usePanelModeStore((s) => s.setMode);

  return (
    <div
      className="flex h-toolbar shrink-0 items-center justify-between border-b bg-panel px-3 border-app"
      data-testid="right-panel-header"
    >
      <div
        className="flex items-center gap-1 rounded-lg p-0.5 text-xs"
        style={{ backgroundColor: 'var(--bg-hover)' }}
      >
        {TABS.map((t) => {
          const isActive = mode === t.id;
          return (
            <button
              key={t.id}
              type="button"
              data-testid={`panel-mode-${t.id}`}
              aria-pressed={isActive}
              className={
                isActive
                  ? 'rounded border px-2 py-1 font-medium border-app shadow-sm'
                  : 'rounded px-2 py-1 text-secondary-app'
              }
              style={isActive ? { backgroundColor: 'var(--bg-panel)' } : undefined}
              onClick={() => setMode(t.id)}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      <ZoomMenu />
    </div>
  );
}
