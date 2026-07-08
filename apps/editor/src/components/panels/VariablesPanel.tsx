import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Trash2, X, Search, Link2, Link2Off } from 'lucide-react';
import type { OpenDoc } from '@openmake/core';
import type { Variable, VariableType } from '@openmake/shared';
import { isVariableAlias } from '@openmake/shared';
import { useDocVersion } from '../../hooks/document.js';
import { useVariablesStore, activeModeIdFor } from '../../store/variables.js';
import { colorToHex, hexToColor } from '../../lib/color.js';

export interface VariablesPanelProps {
  doc: OpenDoc;
}

const VARIABLE_TYPES: VariableType[] = ['COLOR', 'FLOAT', 'STRING', 'BOOLEAN'];

/** Pseudo-group id representing "all variables in the collection". */
export const ALL_GROUP = '__all__';

/**
 * Derive the group list for a set of variables from slash-prefixes of their
 * names: `s-badge/base` → group `s-badge`; a name without a slash belongs to no
 * group (only the `All` pseudo-group). Returns `[{ id: ALL_GROUP, count }, …]`
 * with real groups sorted alphabetically, each carrying its member count.
 */
export function groupsOf(variables: Variable[]): { id: string; label: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const v of variables) {
    const slash = v.name.indexOf('/');
    if (slash <= 0) continue;
    const group = v.name.slice(0, slash);
    counts.set(group, (counts.get(group) ?? 0) + 1);
  }
  const groups = [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, count]) => ({ id, label: id, count }));
  return [{ id: ALL_GROUP, label: 'All', count: variables.length }, ...groups];
}

/** Does a variable belong to the selected group? `ALL_GROUP` matches every one. */
function inGroup(variable: Variable, groupId: string): boolean {
  if (groupId === ALL_GROUP) return true;
  const slash = variable.name.indexOf('/');
  return slash > 0 && variable.name.slice(0, slash) === groupId;
}

/**
 * Variables full-view (Figma parity, spec task #13). A wide surface with a
 * collections sub-column (variable counts + groups), and a main table of
 * Name + one column per mode of the selected collection. Value cells edit by
 * type; any cell can be aliased to another same-type variable (cycle-guarded).
 *
 * Every write goes through OpenDoc methods + commitUndoGroup — no document
 * state is held in React state (only transient UI: selection, search, drafts).
 */
export function VariablesPanel({ doc }: VariablesPanelProps) {
  useDocVersion(doc);
  const collections = doc.getVariableCollections();
  const collectionIds = Object.keys(collections);
  const [selectedId, setSelectedId] = useState<string | null>(collectionIds[0] ?? null);
  const [selectedGroup, setSelectedGroup] = useState<string>(ALL_GROUP);
  const [search, setSearch] = useState('');

  // Keep a valid collection selection as collections are added/removed.
  useEffect(() => {
    if (selectedId && collections[selectedId]) return;
    setSelectedId(collectionIds[0] ?? null);
  }, [selectedId, collectionIds, collections]);

  const activeModeByCollection = useVariablesStore((s) => s.activeModeByCollection);

  const collection = selectedId ? collections[selectedId] : undefined;

  const allVars = Object.values(doc.getVariables())
    .filter((v) => v.collectionId === selectedId)
    .sort((a, b) => a.name.localeCompare(b.name));

  const groups = useMemo(() => groupsOf(allVars), [allVars]);

  // Reset the group selection if it no longer exists in this collection.
  useEffect(() => {
    if (selectedGroup === ALL_GROUP) return;
    if (!groups.some((g) => g.id === selectedGroup)) setSelectedGroup(ALL_GROUP);
  }, [selectedGroup, groups]);

  const query = search.trim().toLowerCase();
  const rows = allVars.filter(
    (v) => inGroup(v, selectedGroup) && (!query || v.name.toLowerCase().includes(query)),
  );

  const addCollection = () => {
    const id = doc.createVariableCollection(`Collection ${collectionIds.length + 1}`);
    doc.commitUndoGroup();
    setSelectedId(id);
    setSelectedGroup(ALL_GROUP);
  };

  const addMode = () => {
    if (!collection) return;
    doc.addMode(collection.id, `Mode ${collection.modes.length + 1}`);
    doc.commitUndoGroup();
  };

  const createVariable = (type: VariableType) => {
    if (!collection) return;
    // Prefix new variables with the selected group so they land in it.
    const base = `variable-${allVars.length + 1}`;
    const name = selectedGroup === ALL_GROUP ? base : `${selectedGroup}/${base}`;
    doc.createVariable(collection.id, type, name);
    doc.commitUndoGroup();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="variables-panel">
      <div className="flex min-h-0 flex-1">
        {/* Left sub-column: collections + groups */}
        <div className="flex w-48 shrink-0 flex-col overflow-y-auto border-r border-app">
          <div className="p-2">
            <div className="mb-1 flex items-center justify-between px-1">
              <span className="text-xs font-medium text-secondary-app">Collections</span>
              <button
                type="button"
                data-testid="add-collection-button"
                title="Add collection"
                className="bg-hover-app rounded p-0.5 text-secondary-app"
                onClick={addCollection}
              >
                <Plus size={14} strokeWidth={1.75} />
              </button>
            </div>
            {collectionIds.length === 0 ? (
              <p className="px-1 py-2 text-xs text-secondary-app">No collections yet.</p>
            ) : (
              <ul className="flex flex-col gap-0.5">
                {collectionIds.map((id) => {
                  const count = Object.values(doc.getVariables()).filter(
                    (v) => v.collectionId === id,
                  ).length;
                  return (
                    <li key={id} className="flex items-center gap-1">
                      <button
                        type="button"
                        data-testid={`collection-${id}`}
                        className="flex flex-1 items-center justify-between rounded px-1.5 py-1 text-left text-xs bg-hover-app"
                        style={
                          id === selectedId ? { backgroundColor: 'var(--bg-active)' } : undefined
                        }
                        onClick={() => {
                          setSelectedId(id);
                          setSelectedGroup(ALL_GROUP);
                        }}
                      >
                        <span className="truncate">{collections[id]!.name}</span>
                        <span
                          className="ml-1 shrink-0 text-[10px] text-secondary-app"
                          data-testid={`collection-count-${id}`}
                        >
                          {count}
                        </span>
                      </button>
                      <button
                        type="button"
                        data-testid={`delete-collection-${id}`}
                        title="Delete collection"
                        className="text-secondary-app"
                        onClick={() => {
                          doc.deleteCollection(id);
                          doc.commitUndoGroup();
                        }}
                      >
                        <Trash2 size={12} strokeWidth={1.75} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {collection && (
            <div className="border-t p-2 border-app">
              <span className="mb-1 block px-1 text-xs font-medium text-secondary-app">Groups</span>
              <ul className="flex flex-col gap-0.5">
                {groups.map((g) => (
                  <li key={g.id}>
                    <button
                      type="button"
                      data-testid={`group-${g.id}`}
                      className="flex w-full items-center justify-between rounded px-1.5 py-1 text-left text-xs bg-hover-app"
                      style={
                        g.id === selectedGroup ? { backgroundColor: 'var(--bg-active)' } : undefined
                      }
                      onClick={() => setSelectedGroup(g.id)}
                    >
                      <span className="truncate">{g.label}</span>
                      <span className="ml-1 shrink-0 text-[10px] text-secondary-app">{g.count}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Main table */}
        <div className="flex min-w-0 flex-1 flex-col">
          {!collection ? (
            <p className="p-4 text-xs text-secondary-app">Select or create a collection.</p>
          ) : (
            <>
              {/* Search */}
              <div className="flex items-center gap-1 border-b p-2 border-app">
                <Search size={13} strokeWidth={1.75} className="text-secondary-app" />
                <input
                  type="text"
                  data-testid="variable-search"
                  placeholder="Search variables"
                  className="w-full bg-transparent text-xs outline-none"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              <div className="min-h-0 flex-1 overflow-auto">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-app">
                      <th className="w-40 px-2 py-1.5 text-left font-medium text-secondary-app">
                        Name
                      </th>
                      {collection.modes.map((mode) => (
                        <ModeHeader
                          key={mode.id}
                          name={mode.name}
                          canRemove={collection.modes.length > 1}
                          testId={`mode-header-${mode.id}`}
                          onRename={(name) => {
                            doc.renameMode(collection.id, mode.id, name);
                            doc.commitUndoGroup();
                          }}
                          onRemove={() => {
                            doc.removeMode(collection.id, mode.id);
                            doc.commitUndoGroup();
                          }}
                        />
                      ))}
                      <th className="w-8 px-1 py-1.5 text-left">
                        <button
                          type="button"
                          data-testid="add-mode-button"
                          title="Add mode"
                          className="bg-hover-app rounded p-0.5 text-secondary-app"
                          onClick={addMode}
                        >
                          <Plus size={14} strokeWidth={1.75} />
                        </button>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={collection.modes.length + 2}
                          className="px-2 py-3 text-secondary-app"
                        >
                          No variables.
                        </td>
                      </tr>
                    ) : (
                      rows.map((variable) => (
                        <VariableTableRow
                          key={variable.id}
                          doc={doc}
                          variable={variable}
                          modeIds={collection.modes.map((m) => m.id)}
                          activeModeId={activeModeIdFor(
                            doc,
                            collection.id,
                            activeModeByCollection,
                          )}
                        />
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Create-variable row */}
              <div className="flex items-center gap-2 border-t p-2 border-app">
                <span className="text-xs text-secondary-app">+ Create variable</span>
                {VARIABLE_TYPES.map((type) => (
                  <button
                    key={type}
                    type="button"
                    data-testid={`create-variable-${type}`}
                    className="bg-hover-app rounded px-1.5 py-0.5 text-[10px] uppercase text-secondary-app"
                    onClick={() => createVariable(type)}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ModeHeader({
  name,
  canRemove,
  onRename,
  onRemove,
  testId,
}: {
  name: string;
  canRemove: boolean;
  onRename: (name: string) => void;
  onRemove: () => void;
  testId: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);

  return (
    <th className="min-w-[8rem] px-2 py-1.5 text-left font-medium text-secondary-app">
      {editing ? (
        <input
          autoFocus
          data-testid={`${testId}-rename`}
          className="w-24 rounded border px-1 py-0.5 text-xs border-app"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            if (draft.trim()) onRename(draft.trim());
            setEditing(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              if (draft.trim()) onRename(draft.trim());
              setEditing(false);
            }
            if (e.key === 'Escape') setEditing(false);
          }}
        />
      ) : (
        <span className="flex items-center gap-1">
          <button
            type="button"
            data-testid={testId}
            onDoubleClick={() => {
              setDraft(name);
              setEditing(true);
            }}
          >
            {name}
          </button>
          {canRemove && (
            <button
              type="button"
              data-testid={`${testId}-remove`}
              title="Remove mode"
              className="text-secondary-app"
              onClick={onRemove}
            >
              <X size={11} strokeWidth={2} />
            </button>
          )}
        </span>
      )}
    </th>
  );
}

function VariableTableRow({
  doc,
  variable,
  modeIds,
  activeModeId,
}: {
  doc: OpenDoc;
  variable: Variable;
  modeIds: string[];
  activeModeId: string | undefined;
}) {
  const [nameDraft, setNameDraft] = useState(variable.name);
  useEffect(() => setNameDraft(variable.name), [variable.name]);

  return (
    <tr className="border-b border-app" data-testid={`variable-${variable.id}`}>
      <td className="px-2 py-1 align-middle">
        <div className="flex items-center gap-1">
          <span
            className="shrink-0 rounded bg-hover-app px-1 py-0.5 text-[9px] uppercase text-secondary-app"
            data-testid={`variable-type-${variable.id}`}
          >
            {variable.type}
          </span>
          <input
            type="text"
            data-testid={`variable-name-${variable.id}`}
            className="w-full min-w-0 rounded border bg-transparent px-1 py-0.5 text-xs border-app"
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={() => {
              const next = nameDraft.trim();
              if (next && next !== variable.name) {
                doc.updateVariable(variable.id, { name: next });
                doc.commitUndoGroup();
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const next = nameDraft.trim();
                if (next && next !== variable.name) {
                  doc.updateVariable(variable.id, { name: next });
                  doc.commitUndoGroup();
                }
              }
            }}
          />
          <button
            type="button"
            data-testid={`delete-variable-${variable.id}`}
            title="Delete variable"
            className="ml-auto text-secondary-app"
            onClick={() => {
              doc.deleteVariable(variable.id);
              doc.commitUndoGroup();
            }}
          >
            <Trash2 size={12} strokeWidth={1.75} />
          </button>
        </div>
      </td>
      {modeIds.map((modeId) => (
        <td key={modeId} className="px-2 py-1 align-middle">
          <ValueCell doc={doc} variable={variable} modeId={modeId} />
        </td>
      ))}
      <td className="px-1 py-1" />
    </tr>
  );
}

function ValueCell({
  doc,
  variable,
  modeId,
}: {
  doc: OpenDoc;
  variable: Variable;
  modeId: string;
}) {
  const [picking, setPicking] = useState(false);
  const value = variable.valuesByMode[modeId];

  const setValue = (v: string | number | boolean) => {
    doc.updateVariable(variable.id, { valuesByMode: { [modeId]: v } });
    doc.commitUndoGroup();
  };

  if (isVariableAlias(value)) {
    const target = doc.getVariables()[value.alias];
    return (
      <span
        className="inline-flex items-center gap-1 rounded bg-hover-app px-1.5 py-0.5"
        data-testid={`alias-chip-${variable.id}-${modeId}`}
      >
        <Link2 size={11} strokeWidth={1.75} className="text-secondary-app" />
        <span className="text-xs">{target ? target.name : '(missing)'}</span>
        <button
          type="button"
          data-testid={`alias-unlink-${variable.id}-${modeId}`}
          title="Remove alias"
          className="text-secondary-app"
          onClick={() => {
            // Clear the alias back to a scalar of the correct type.
            setValue(scalarDefault(variable.type));
          }}
        >
          <Link2Off size={11} strokeWidth={1.75} />
        </button>
      </span>
    );
  }

  return (
    <span className="relative inline-flex items-center gap-1">
      <ScalarEditor type={variable.type} value={value} onChange={setValue} varId={variable.id} modeId={modeId} />
      <button
        type="button"
        data-testid={`alias-button-${variable.id}-${modeId}`}
        title="Alias to another variable"
        className="text-secondary-app"
        onClick={() => setPicking((p) => !p)}
      >
        <Link2 size={12} strokeWidth={1.75} />
      </button>
      {picking && (
        <AliasPicker
          doc={doc}
          variable={variable}
          modeId={modeId}
          onPick={(targetId) => {
            doc.setVariableAlias(variable.id, modeId, targetId);
            doc.commitUndoGroup();
            setPicking(false);
          }}
          onClose={() => setPicking(false)}
        />
      )}
    </span>
  );
}

function AliasPicker({
  doc,
  variable,
  modeId,
  onPick,
  onClose,
}: {
  doc: OpenDoc;
  variable: Variable;
  modeId: string;
  onPick: (targetId: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [onClose]);

  // Same-type candidates, excluding self and any target that would cycle.
  const candidates = Object.values(doc.getVariables()).filter(
    (v) =>
      v.id !== variable.id &&
      v.type === variable.type &&
      !doc.wouldCreateAliasCycle(variable.id, modeId, v.id),
  );
  const q = query.trim().toLowerCase();
  const filtered = candidates.filter((v) => !q || v.name.toLowerCase().includes(q));

  return (
    <div
      ref={ref}
      data-testid={`alias-picker-${variable.id}-${modeId}`}
      className="absolute left-0 top-full z-10 mt-1 w-48 rounded border bg-panel p-1 shadow-lg border-app"
    >
      <input
        autoFocus
        type="text"
        data-testid={`alias-picker-search-${variable.id}-${modeId}`}
        placeholder="Search variables"
        className="mb-1 w-full rounded border bg-transparent px-1 py-0.5 text-xs border-app"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {filtered.length === 0 ? (
        <p className="px-1 py-1 text-[11px] text-secondary-app">No candidates.</p>
      ) : (
        <ul className="max-h-48 overflow-y-auto">
          {filtered.map((v) => (
            <li key={v.id}>
              <button
                type="button"
                data-testid={`alias-candidate-${v.id}`}
                className="w-full rounded px-1.5 py-1 text-left text-xs bg-hover-app"
                onClick={() => onPick(v.id)}
              >
                {v.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Neutral scalar for a type — used when clearing an alias. */
function scalarDefault(type: VariableType): string | number | boolean {
  switch (type) {
    case 'COLOR':
      return '#000000';
    case 'FLOAT':
      return 0;
    case 'STRING':
      return '';
    case 'BOOLEAN':
      return false;
  }
}

function ScalarEditor({
  type,
  value,
  onChange,
  varId,
  modeId,
}: {
  type: VariableType;
  value: string | number | boolean | undefined;
  onChange: (value: string | number | boolean) => void;
  varId: string;
  modeId: string;
}) {
  const testId = `variable-value-${varId}-${modeId}`;
  if (type === 'COLOR') {
    const hex = typeof value === 'string' ? value : '#000000';
    const color = hexToColor(hex);
    const normalized = color ? colorToHex(color) : '#000000';
    return (
      <span className="inline-flex items-center gap-1">
        <input
          type="color"
          data-testid={`${testId}-swatch`}
          className="h-5 w-5 shrink-0 rounded border p-0 border-app"
          value={normalized}
          onChange={(e) => onChange(e.target.value)}
        />
        <input
          type="text"
          data-testid={testId}
          className="w-20 rounded border bg-transparent px-1 py-0.5 text-xs border-app"
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
        />
      </span>
    );
  }
  if (type === 'FLOAT') {
    return (
      <input
        type="number"
        data-testid={testId}
        className="w-16 rounded border bg-transparent px-1 py-0.5 text-xs border-app"
        value={typeof value === 'number' ? value : 0}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    );
  }
  if (type === 'BOOLEAN') {
    return (
      <input
        type="checkbox"
        data-testid={testId}
        checked={value === true}
        onChange={(e) => onChange(e.target.checked)}
      />
    );
  }
  return (
    <input
      type="text"
      data-testid={testId}
      className="w-24 rounded border bg-transparent px-1 py-0.5 text-xs border-app"
      value={typeof value === 'string' ? value : ''}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
