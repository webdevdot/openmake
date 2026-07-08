import { useState } from 'react';
import { ChevronDown, ChevronRight, Eye, EyeOff, Lock, LockOpen } from 'lucide-react';
import type { OpenDoc } from '@openmake/core';
import { useDocVersion } from '../../hooks/document.js';
import { useSelectionStore } from '../../store/selection.js';

export interface LayersTreeProps {
  doc: OpenDoc;
  pageId: string;
}

export function LayersTree({ doc, pageId }: LayersTreeProps) {
  useDocVersion(doc);
  const selection = useSelectionStore((s) => s.selectedIds);
  const setSelection = useSelectionStore((s) => s.set);
  const toggleSelection = useSelectionStore((s) => s.toggle);

  return (
    <div data-testid="layers-tree" className="flex-1 overflow-y-auto p-2">
      <div className="mb-1 px-1 text-xs font-medium text-secondary-app">Layers</div>
      {doc.getChildrenIds(pageId).length === 0 && (
        <div data-testid="layers-empty" className="px-1 text-xs text-secondary-app">
          No layers yet — draw with R, O, L or T
        </div>
      )}
      <LayerNodeList
        doc={doc}
        parentId={pageId}
        depth={0}
        selection={selection}
        onSelect={(id, shift) => (shift ? toggleSelection(id) : setSelection([id]))}
      />
    </div>
  );
}

function LayerNodeList({
  doc,
  parentId,
  depth,
  selection,
  onSelect,
}: {
  doc: OpenDoc;
  parentId: string;
  depth: number;
  selection: string[];
  onSelect: (id: string, shift: boolean) => void;
}) {
  // Reverse so top-of-z-order renders first (matches visual stacking, Figma-style).
  const childIds = [...doc.getChildrenIds(parentId)].reverse();
  return (
    <>
      {childIds.map((id) => (
        <LayerRow
          key={id}
          doc={doc}
          id={id}
          depth={depth}
          selection={selection}
          onSelect={onSelect}
        />
      ))}
    </>
  );
}

function LayerRow({
  doc,
  id,
  depth,
  selection,
  onSelect,
}: {
  doc: OpenDoc;
  id: string;
  depth: number;
  selection: string[];
  onSelect: (id: string, shift: boolean) => void;
}) {
  const node = doc.getNode(id);
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState(node?.name ?? '');
  const [expanded, setExpanded] = useState(true);
  if (!node) return null;

  const hasChildren = 'children' in node && (node.children as string[]).length > 0;
  const isSelected = selection.includes(id);

  const commitRename = () => {
    if (draftName.trim()) doc.updateNode(id, { name: draftName.trim() });
    doc.commitUndoGroup();
    setRenaming(false);
  };

  return (
    <div>
      <div
        data-testid={`layer-row-${id}`}
        className={`flex items-center gap-1 rounded px-1 py-0.5 text-xs bg-hover-app${
          node.visible ? '' : ' opacity-50'
        }`}
        style={{
          paddingLeft: 8 + depth * 12,
          backgroundColor: isSelected ? 'var(--bg-active)' : undefined,
        }}
        onClick={(e) => onSelect(id, e.shiftKey)}
        onDoubleClick={() => setRenaming(true)}
      >
        {hasChildren ? (
          <button
            type="button"
            className="w-3.5 shrink-0 text-secondary-app"
            aria-label={expanded ? 'Collapse' : 'Expand'}
            onClick={(e) => {
              e.stopPropagation();
              setExpanded((v) => !v);
            }}
          >
            {expanded ? (
              <ChevronDown size={14} strokeWidth={1.75} />
            ) : (
              <ChevronRight size={14} strokeWidth={1.75} />
            )}
          </button>
        ) : (
          <span className="w-3.5 shrink-0" />
        )}

        {renaming ? (
          <input
            autoFocus
            className="flex-1 rounded px-1"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename();
              if (e.key === 'Escape') setRenaming(false);
            }}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="flex-1 truncate">{node.name}</span>
        )}

        <button
          type="button"
          data-testid={`layer-visibility-${id}`}
          className="shrink-0 text-secondary-app"
          title={node.visible ? 'Hide' : 'Show'}
          onClick={(e) => {
            e.stopPropagation();
            doc.updateNode(id, { visible: !node.visible });
            doc.commitUndoGroup();
          }}
        >
          {node.visible ? (
            <Eye size={14} strokeWidth={1.75} />
          ) : (
            <EyeOff size={14} strokeWidth={1.75} />
          )}
        </button>
        <button
          type="button"
          data-testid={`layer-lock-${id}`}
          className="shrink-0 text-secondary-app"
          title={node.locked ? 'Unlock' : 'Lock'}
          onClick={(e) => {
            e.stopPropagation();
            doc.updateNode(id, { locked: !node.locked });
            doc.commitUndoGroup();
          }}
        >
          {node.locked ? (
            <Lock size={14} strokeWidth={1.75} />
          ) : (
            <LockOpen size={14} strokeWidth={1.75} />
          )}
        </button>
      </div>
      {hasChildren && expanded && (
        <LayerNodeList
          doc={doc}
          parentId={id}
          depth={depth + 1}
          selection={selection}
          onSelect={onSelect}
        />
      )}
    </div>
  );
}
