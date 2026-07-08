import type { OpenDoc } from '@openmake/core';
import { useState } from 'react';
import type { AutoLayout, SceneNode, SizingMode } from '@openmake/shared';
import { NumberField } from './NumberField.js';

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

type Primary = 'MIN' | 'CENTER' | 'MAX';
type Counter = 'MIN' | 'CENTER' | 'MAX';

// The 9-dot grid is expressed in screen space (row = vertical position, col =
// horizontal position). Which of primary/counter axis a screen axis maps to
// depends on the layout mode, so the grid cell -> (justifyContent, alignItems)
// translation is done via helpers below rather than a static table.
const GRID_ROWS: Counter[] = ['MIN', 'CENTER', 'MAX'];
const GRID_COLS: Primary[] = ['MIN', 'CENTER', 'MAX'];

/** Map a screen grid cell (row, col) to the primary/counter axis values. */
function cellToAxes(
  mode: AutoLayout['mode'],
  row: Counter,
  col: Primary,
): { justifyContent: Primary; alignItems: Counter } {
  if (mode === 'HORIZONTAL') {
    // Primary axis is horizontal (columns), counter axis is vertical (rows).
    return { justifyContent: col, alignItems: row };
  }
  // VERTICAL: primary axis is vertical (rows), counter axis is horizontal (cols).
  return { justifyContent: row, alignItems: col };
}

/** True when the current auto-layout alignment lands on this screen grid cell. */
function isCellActive(autoLayout: AutoLayout, row: Counter, col: Primary): boolean {
  // SPACE_BETWEEN / BASELINE are not representable on the 3x3 grid.
  if (autoLayout.justifyContent === 'SPACE_BETWEEN' || autoLayout.alignItems === 'BASELINE') {
    return false;
  }
  const { justifyContent, alignItems } = cellToAxes(autoLayout.mode, row, col);
  return autoLayout.justifyContent === justifyContent && autoLayout.alignItems === alignItems;
}

const SIZING_MODES: SizingMode[] = ['FIXED', 'HUG', 'FILL'];
const SIZING_LABEL: Record<SizingMode, string> = {
  FIXED: 'Fixed',
  HUG: 'Hug',
  FILL: 'Fill',
};

export function AutoLayoutSection({ doc, node }: AutoLayoutSectionProps) {
  const autoLayout = node.autoLayout;
  const [paddingLinked, setPaddingLinked] = useState(true);

  const commit = (patch: Partial<AutoLayout>) => {
    doc.updateNode(node.id, { autoLayout: { ...(autoLayout ?? DEFAULT_AUTO_LAYOUT), ...patch } });
    doc.commitUndoGroup();
  };

  const toggle = (enabled: boolean) => {
    doc.updateNode(node.id, { autoLayout: enabled ? DEFAULT_AUTO_LAYOUT : undefined });
    doc.commitUndoGroup();
  };

  // Per-child sizing applies to the selected node relative to ITS auto-layout
  // parent (Figma's "resizing" control). Only shown when the parent lays out
  // with auto-layout, matching the engine, which ignores layoutSizing* on
  // children of non-auto-layout parents.
  const parentId = doc.getParentId(node.id);
  const parent = parentId ? doc.getNode(parentId) : undefined;
  const parentHasAutoLayout =
    parent !== undefined && 'autoLayout' in parent && parent.autoLayout !== undefined;

  const setSizing = (axis: 'layoutSizingHorizontal' | 'layoutSizingVertical', value: SizingMode) => {
    doc.updateNode(node.id, { [axis]: value });
    doc.commitUndoGroup();
  };

  const paddingAll = (v: number) => {
    commit({ paddingTop: v, paddingRight: v, paddingBottom: v, paddingLeft: v });
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
              style={
                autoLayout.mode === 'HORIZONTAL'
                  ? { backgroundColor: 'var(--bg-active)' }
                  : undefined
              }
              onClick={() => commit({ mode: 'HORIZONTAL' })}
            >
              Horizontal
            </button>
            <button
              type="button"
              data-testid="auto-layout-direction-vertical"
              className="flex-1 rounded border py-0.5 text-xs bg-hover-app border-app"
              style={
                autoLayout.mode === 'VERTICAL' ? { backgroundColor: 'var(--bg-active)' } : undefined
              }
              onClick={() => commit({ mode: 'VERTICAL' })}
            >
              Vertical
            </button>
          </div>

          <label className="flex items-center justify-between text-xs">
            <span className="text-secondary-app">Wrap</span>
            <input
              type="checkbox"
              data-testid="auto-layout-wrap-toggle"
              checked={autoLayout.wrap}
              onChange={(e) => commit({ wrap: e.target.checked })}
            />
          </label>

          <NumberField
            label="Gap"
            value={autoLayout.gap}
            onCommit={(v) => commit({ gap: Math.max(0, v) })}
            testId="auto-layout-gap-input"
          />

          <div className="flex flex-col gap-1">
            <label className="flex items-center justify-between text-xs">
              <span className="text-secondary-app">Padding</span>
              <button
                type="button"
                data-testid="auto-layout-padding-link-toggle"
                className="rounded border px-1 py-0.5 text-xs bg-hover-app border-app"
                style={paddingLinked ? { backgroundColor: 'var(--bg-active)' } : undefined}
                onClick={() => setPaddingLinked((v) => !v)}
                title={paddingLinked ? 'Padding linked' : 'Padding per-side'}
              >
                {paddingLinked ? 'Linked' : 'Sides'}
              </button>
            </label>
            {paddingLinked ? (
              <NumberField
                label="P"
                value={autoLayout.paddingTop}
                onCommit={(v) => paddingAll(Math.max(0, v))}
                testId="auto-layout-padding-input"
              />
            ) : (
              <div className="grid grid-cols-2 gap-1">
                <NumberField
                  label="T"
                  value={autoLayout.paddingTop}
                  onCommit={(v) => commit({ paddingTop: Math.max(0, v) })}
                  testId="auto-layout-padding-top"
                />
                <NumberField
                  label="R"
                  value={autoLayout.paddingRight}
                  onCommit={(v) => commit({ paddingRight: Math.max(0, v) })}
                  testId="auto-layout-padding-right"
                />
                <NumberField
                  label="B"
                  value={autoLayout.paddingBottom}
                  onCommit={(v) => commit({ paddingBottom: Math.max(0, v) })}
                  testId="auto-layout-padding-bottom"
                />
                <NumberField
                  label="L"
                  value={autoLayout.paddingLeft}
                  onCommit={(v) => commit({ paddingLeft: Math.max(0, v) })}
                  testId="auto-layout-padding-left"
                />
              </div>
            )}
          </div>

          <div>
            <span className="mb-1 block text-xs text-secondary-app">Align</span>
            <div className="grid w-fit grid-cols-3 gap-0.5 rounded border p-1 border-app">
              {GRID_ROWS.map((row) =>
                GRID_COLS.map((col) => {
                  const active = isCellActive(autoLayout, row, col);
                  return (
                    <button
                      key={`${row}-${col}`}
                      type="button"
                      data-testid={`align-cell-${row}-${col}`}
                      className="h-4 w-4 rounded-sm bg-hover-app"
                      style={
                        active
                          ? { backgroundColor: 'var(--color-accent)' }
                          : { backgroundColor: 'var(--bg-active)' }
                      }
                      onClick={() => commit(cellToAxes(autoLayout.mode, row, col))}
                    />
                  );
                }),
              )}
            </div>
          </div>

          <label className="flex items-center gap-1 text-xs">
            <span className="text-secondary-app">Distribute</span>
            <button
              type="button"
              data-testid="auto-layout-space-between"
              className="ml-auto rounded border px-1 py-0.5 text-xs bg-hover-app border-app"
              style={
                autoLayout.justifyContent === 'SPACE_BETWEEN'
                  ? { backgroundColor: 'var(--bg-active)' }
                  : undefined
              }
              onClick={() =>
                commit({
                  justifyContent:
                    autoLayout.justifyContent === 'SPACE_BETWEEN' ? 'MIN' : 'SPACE_BETWEEN',
                })
              }
            >
              Space between
            </button>
          </label>
        </div>
      )}

      {parentHasAutoLayout && (
        <div className="mt-2 flex flex-col gap-1" data-testid="child-sizing">
          <span className="text-xs text-secondary-app">Resizing</span>
          <div className="flex items-center gap-1 text-xs">
            <span className="w-14 text-secondary-app">Horizontal</span>
            <div className="flex flex-1 gap-0.5">
              {SIZING_MODES.map((m) => (
                <button
                  key={m}
                  type="button"
                  data-testid={`sizing-horizontal-${m}`}
                  className="flex-1 rounded border py-0.5 text-xs bg-hover-app border-app"
                  style={
                    (node.layoutSizingHorizontal ?? 'FIXED') === m
                      ? { backgroundColor: 'var(--bg-active)' }
                      : undefined
                  }
                  onClick={() => setSizing('layoutSizingHorizontal', m)}
                >
                  {SIZING_LABEL[m]}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-1 text-xs">
            <span className="w-14 text-secondary-app">Vertical</span>
            <div className="flex flex-1 gap-0.5">
              {SIZING_MODES.map((m) => (
                <button
                  key={m}
                  type="button"
                  data-testid={`sizing-vertical-${m}`}
                  className="flex-1 rounded border py-0.5 text-xs bg-hover-app border-app"
                  style={
                    (node.layoutSizingVertical ?? 'FIXED') === m
                      ? { backgroundColor: 'var(--bg-active)' }
                      : undefined
                  }
                  onClick={() => setSizing('layoutSizingVertical', m)}
                >
                  {SIZING_LABEL[m]}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
