import { useEffect, useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import type { OpenDoc } from '@openmake/core';
import type { Variable, VariableType } from '@openmake/shared';
import { useDocVersion } from '../../hooks/document.js';
import { useVariablesStore, activeModeIdFor } from '../../store/variables.js';
import { colorToHex, hexToColor } from '../../lib/color.js';

export interface VariablesPanelProps {
  doc: OpenDoc;
}

const VARIABLE_TYPES: VariableType[] = ['COLOR', 'FLOAT', 'STRING', 'BOOLEAN'];

/**
 * Left-rail "Variables" panel (design tokens, spec §3.5). Manages doc-level
 * variable collections, their modes, and typed variables. Every write goes
 * through OpenDoc methods + commitUndoGroup — no document state is held in React
 * state (only transient UI drafts: which collection is selected, rename drafts).
 */
export function VariablesPanel({ doc }: VariablesPanelProps) {
  useDocVersion(doc);
  const collections = doc.getVariableCollections();
  const collectionIds = Object.keys(collections);
  const [selectedId, setSelectedId] = useState<string | null>(collectionIds[0] ?? null);

  // Keep a valid selection as collections are added/removed.
  useEffect(() => {
    if (selectedId && collections[selectedId]) return;
    setSelectedId(collectionIds[0] ?? null);
  }, [selectedId, collectionIds, collections]);

  const activeModeByCollection = useVariablesStore((s) => s.activeModeByCollection);
  const setActiveMode = useVariablesStore((s) => s.setActiveMode);

  const collection = selectedId ? collections[selectedId] : undefined;
  const activeModeId = collection
    ? activeModeIdFor(doc, collection.id, activeModeByCollection)
    : undefined;

  const variables = Object.values(doc.getVariables())
    .filter((v) => v.collectionId === selectedId)
    .sort((a, b) => a.name.localeCompare(b.name));

  const addCollection = () => {
    const id = doc.createVariableCollection(`Collection ${collectionIds.length + 1}`);
    doc.commitUndoGroup();
    setSelectedId(id);
  };

  const addMode = () => {
    if (!collection) return;
    doc.addMode(collection.id, `Mode ${collection.modes.length + 1}`);
    doc.commitUndoGroup();
  };

  const addVariable = () => {
    if (!collection) return;
    doc.createVariable(collection.id, 'COLOR', `variable-${variables.length + 1}`);
    doc.commitUndoGroup();
  };

  return (
    <div
      className="flex w-panel-left shrink-0 flex-col border-r bg-panel border-app"
      data-testid="variables-panel"
    >
      {/* Collection selector */}
      <div className="border-b p-2 border-app">
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
          <ul>
            {collectionIds.map((id) => (
              <li key={id} className="flex items-center gap-1">
                <button
                  type="button"
                  data-testid={`collection-${id}`}
                  className="flex-1 rounded px-1 py-0.5 text-left text-xs bg-hover-app"
                  style={id === selectedId ? { backgroundColor: 'var(--bg-active)' } : undefined}
                  onClick={() => setSelectedId(id)}
                >
                  {collections[id]!.name}
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
            ))}
          </ul>
        )}
      </div>

      {collection && activeModeId && (
        <>
          {/* Mode tabs */}
          <div className="border-b p-2 border-app">
            <div className="mb-1 flex items-center justify-between px-1">
              <span className="text-xs font-medium text-secondary-app">Modes</span>
              <button
                type="button"
                data-testid="add-mode-button"
                title="Add mode"
                className="bg-hover-app rounded p-0.5 text-secondary-app"
                onClick={addMode}
              >
                <Plus size={14} strokeWidth={1.75} />
              </button>
            </div>
            <div className="flex flex-wrap gap-1">
              {collection.modes.map((mode) => (
                <ModeTab
                  key={mode.id}
                  name={mode.name}
                  active={mode.id === activeModeId}
                  canRemove={collection.modes.length > 1}
                  onSelect={() => setActiveMode(collection.id, mode.id)}
                  onRename={(name) => {
                    doc.renameMode(collection.id, mode.id, name);
                    doc.commitUndoGroup();
                  }}
                  onRemove={() => {
                    doc.removeMode(collection.id, mode.id);
                    doc.commitUndoGroup();
                  }}
                  testId={`mode-${mode.id}`}
                />
              ))}
            </div>
          </div>

          {/* Variables */}
          <div className="flex-1 overflow-y-auto p-2">
            <div className="mb-1 flex items-center justify-between px-1">
              <span className="text-xs font-medium text-secondary-app">Variables</span>
              <button
                type="button"
                data-testid="add-variable-button"
                title="Add variable"
                className="bg-hover-app rounded p-0.5 text-secondary-app"
                onClick={addVariable}
              >
                <Plus size={14} strokeWidth={1.75} />
              </button>
            </div>
            {variables.length === 0 ? (
              <p className="px-1 py-2 text-xs text-secondary-app">No variables yet.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {variables.map((variable) => (
                  <VariableRow
                    key={variable.id}
                    variable={variable}
                    modeId={activeModeId}
                    onRename={(name) => {
                      doc.updateVariable(variable.id, { name });
                      doc.commitUndoGroup();
                    }}
                    onSetValue={(value) => {
                      doc.updateVariable(variable.id, { valuesByMode: { [activeModeId]: value } });
                      doc.commitUndoGroup();
                    }}
                    onDelete={() => {
                      doc.deleteVariable(variable.id);
                      doc.commitUndoGroup();
                    }}
                  />
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function ModeTab({
  name,
  active,
  canRemove,
  onSelect,
  onRename,
  onRemove,
  testId,
}: {
  name: string;
  active: boolean;
  canRemove: boolean;
  onSelect: () => void;
  onRename: (name: string) => void;
  onRemove: () => void;
  testId: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);

  if (editing) {
    return (
      <input
        autoFocus
        data-testid={`${testId}-rename`}
        className="w-20 rounded border px-1 py-0.5 text-xs border-app"
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
    );
  }

  return (
    <span
      className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs bg-hover-app"
      style={active ? { backgroundColor: 'var(--bg-active)' } : undefined}
    >
      <button
        type="button"
        data-testid={testId}
        onClick={onSelect}
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
  );
}

function VariableRow({
  variable,
  modeId,
  onRename,
  onSetValue,
  onDelete,
}: {
  variable: Variable;
  modeId: string;
  onRename: (name: string) => void;
  onSetValue: (value: string | number | boolean) => void;
  onDelete: () => void;
}) {
  const [nameDraft, setNameDraft] = useState(variable.name);
  useEffect(() => setNameDraft(variable.name), [variable.name]);
  const value = variable.valuesByMode[modeId];

  return (
    <li className="flex items-center gap-1" data-testid={`variable-${variable.id}`}>
      <span
        className="w-12 shrink-0 rounded bg-hover-app px-1 py-0.5 text-center text-[9px] uppercase text-secondary-app"
        data-testid={`variable-type-${variable.id}`}
      >
        {variable.type}
      </span>
      <input
        type="text"
        data-testid={`variable-name-${variable.id}`}
        className="w-20 rounded border bg-transparent px-1 py-0.5 text-xs border-app"
        value={nameDraft}
        onChange={(e) => setNameDraft(e.target.value)}
        onBlur={() => nameDraft.trim() && onRename(nameDraft.trim())}
        onKeyDown={(e) => e.key === 'Enter' && nameDraft.trim() && onRename(nameDraft.trim())}
      />
      <ValueEditor type={variable.type} value={value} onChange={onSetValue} varId={variable.id} />
      <button
        type="button"
        data-testid={`delete-variable-${variable.id}`}
        title="Delete variable"
        className="ml-auto text-secondary-app"
        onClick={onDelete}
      >
        <Trash2 size={12} strokeWidth={1.75} />
      </button>
    </li>
  );
}

function ValueEditor({
  type,
  value,
  onChange,
  varId,
}: {
  type: VariableType;
  value: string | number | boolean | undefined;
  onChange: (value: string | number | boolean) => void;
  varId: string;
}) {
  if (type === 'COLOR') {
    const hex = typeof value === 'string' ? value : '#000000';
    const color = hexToColor(hex);
    return (
      <input
        type="color"
        data-testid={`variable-value-${varId}`}
        className="h-5 w-5 shrink-0 rounded border p-0 border-app"
        value={color ? colorToHex(color) : '#000000'}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }
  if (type === 'FLOAT') {
    return (
      <input
        type="number"
        data-testid={`variable-value-${varId}`}
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
        data-testid={`variable-value-${varId}`}
        checked={value === true}
        onChange={(e) => onChange(e.target.checked)}
      />
    );
  }
  return (
    <input
      type="text"
      data-testid={`variable-value-${varId}`}
      className="w-20 rounded border bg-transparent px-1 py-0.5 text-xs border-app"
      value={typeof value === 'string' ? value : ''}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
