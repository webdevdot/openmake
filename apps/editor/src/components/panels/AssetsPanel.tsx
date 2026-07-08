import { useMemo, useState } from 'react';
import { Component, Diamond, Search } from 'lucide-react';
import type { OpenDoc } from '@openmake/core';
import { variantPropsOf } from '@openmake/core';
import { useDocVersion } from '../../hooks/document.js';
import { useSelectionStore } from '../../store/selection.js';
import { insertInstance } from '../../lib/instances.js';

/** Figma's component purple — matches LayersTree's component-family treatment. */
const COMPONENT_PURPLE = '#9747ff';

export interface AssetsPanelProps {
  doc: OpenDoc;
  activePageId: string;
  /** World-space point where a clicked component's instance is dropped. */
  getViewportCenter: () => { x: number; y: number };
}

/** A component browser entry: a standalone component, or a set with its variants. */
interface ComponentEntry {
  /** COMPONENT id (standalone) or COMPONENT_SET id (a set of variants). */
  id: string;
  name: string;
  kind: 'COMPONENT' | 'COMPONENT_SET';
  /** For a COMPONENT_SET: its variant COMPONENT children. */
  variants: Array<{ id: string; label: string }>;
}

/** Human label for a variant COMPONENT, e.g. `size=lg, state=hover` (falls back to its name). */
function variantLabel(doc: OpenDoc, componentId: string): string {
  const node = doc.getNode(componentId);
  if (!node || node.type !== 'COMPONENT') return node?.name ?? componentId;
  const props = variantPropsOf(node);
  const entries = Object.entries(props);
  if (entries.length === 0) return node.name;
  return entries.map(([k, v]) => `${k}=${v}`).join(', ');
}

/**
 * Walk every page's subtree and collect COMPONENT_SET nodes (with their variant
 * COMPONENT children) plus standalone COMPONENTs (those not inside a set).
 */
function collectComponents(doc: OpenDoc): ComponentEntry[] {
  const entries: ComponentEntry[] = [];
  const walk = (id: string) => {
    const node = doc.getNode(id);
    if (!node) return;
    if (node.type === 'COMPONENT_SET') {
      entries.push({
        id,
        name: node.name,
        kind: 'COMPONENT_SET',
        variants: doc
          .getChildrenIds(id)
          .filter((cid) => doc.getNode(cid)?.type === 'COMPONENT')
          .map((cid) => ({ id: cid, label: variantLabel(doc, cid) })),
      });
      // Variants are surfaced under the set; don't also walk into them.
      return;
    }
    if (node.type === 'COMPONENT') {
      entries.push({ id, name: node.name, kind: 'COMPONENT', variants: [] });
      // A standalone component can still have non-component descendants; no
      // nested components live below a component in practice, so stop here.
      return;
    }
    for (const child of doc.getChildrenIds(id)) walk(child);
  };
  for (const pageId of doc.getPages()) walk(pageId);
  return entries;
}

export function AssetsPanel({ doc, activePageId, getViewportCenter }: AssetsPanelProps) {
  useDocVersion(doc);
  const setSelection = useSelectionStore((s) => s.set);
  const [query, setQuery] = useState('');

  const entries = useMemo(() => collectComponents(doc), [doc, doc.version]);

  const normalizedQuery = query.trim().toLowerCase();
  const visible = normalizedQuery
    ? entries
        .map((e) => {
          if (e.kind === 'COMPONENT') {
            return e.name.toLowerCase().includes(normalizedQuery) ? e : null;
          }
          // A set matches if its own name matches (keep all variants) or by the
          // subset of variants whose label matches.
          if (e.name.toLowerCase().includes(normalizedQuery)) return e;
          const variants = e.variants.filter((v) =>
            v.label.toLowerCase().includes(normalizedQuery),
          );
          return variants.length > 0 ? { ...e, variants } : null;
        })
        .filter((e): e is ComponentEntry => e !== null)
    : entries;

  const insert = (componentId: string) => {
    const center = getViewportCenter();
    const instId = insertInstance(doc, componentId, activePageId, center);
    setSelection([instId]);
  };

  return (
    <div
      className="flex w-panel-left shrink-0 flex-col border-r bg-panel border-app"
      data-testid="assets-panel"
    >
      <div className="border-b p-2 border-app">
        <div className="flex items-center gap-1 rounded border px-1 py-0.5 border-app">
          <Search size={14} strokeWidth={1.75} className="shrink-0 text-secondary-app" />
          <input
            type="text"
            data-testid="assets-search"
            className="w-full bg-transparent text-xs outline-none"
            placeholder="Search components"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2" data-testid="assets-list">
        <div className="mb-1 px-1 text-xs font-medium text-secondary-app">Components</div>
        {visible.length === 0 && (
          <div data-testid="assets-empty" className="px-1 text-xs text-secondary-app">
            No components yet — create one from the inspector.
          </div>
        )}
        {visible.map((entry) =>
          entry.kind === 'COMPONENT' ? (
            <button
              key={entry.id}
              type="button"
              data-testid={`asset-component-${entry.id}`}
              className="flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left text-xs bg-hover-app"
              onClick={() => insert(entry.id)}
            >
              <Diamond
                size={13}
                strokeWidth={1.75}
                fill={COMPONENT_PURPLE}
                style={{ color: COMPONENT_PURPLE }}
              />
              <span className="flex-1 truncate" style={{ color: COMPONENT_PURPLE }}>
                {entry.name}
              </span>
            </button>
          ) : (
            <div key={entry.id} data-testid={`asset-set-${entry.id}`}>
              <div className="flex items-center gap-1.5 px-1 py-0.5 text-xs">
                <Component
                  size={13}
                  strokeWidth={1.75}
                  style={{ color: COMPONENT_PURPLE }}
                />
                <span className="flex-1 truncate" style={{ color: COMPONENT_PURPLE }}>
                  {entry.name}
                </span>
              </div>
              {entry.variants.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  data-testid={`asset-variant-${v.id}`}
                  className="flex w-full items-center gap-1.5 rounded py-0.5 pl-5 pr-1 text-left text-xs bg-hover-app"
                  onClick={() => insert(v.id)}
                >
                  <Diamond
                    size={12}
                    strokeWidth={1.75}
                    style={{ color: COMPONENT_PURPLE }}
                  />
                  <span className="flex-1 truncate text-secondary-app">{v.label}</span>
                </button>
              ))}
            </div>
          ),
        )}
      </div>
    </div>
  );
}
