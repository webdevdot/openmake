import { useState } from 'react';
import type { OpenDoc } from '@openmake/core';
import { useDocVersion } from '../../hooks/document.js';

export interface PagesListProps {
  doc: OpenDoc;
  activePageId: string;
  onSelectPage: (id: string) => void;
}

export function PagesList({ doc, activePageId, onSelectPage }: PagesListProps) {
  useDocVersion(doc);
  const pageIds = doc.getPages();
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');

  const addPage = () => {
    const id = doc.createNode({ type: 'PAGE', parentId: doc.rootId, name: `Page ${pageIds.length + 1}` });
    doc.commitUndoGroup();
    onSelectPage(id);
  };

  const startRename = (id: string, currentName: string) => {
    setRenamingId(id);
    setDraftName(currentName);
  };

  const commitRename = (id: string) => {
    if (draftName.trim()) doc.updateNode(id, { name: draftName.trim() });
    doc.commitUndoGroup();
    setRenamingId(null);
  };

  return (
    <div data-testid="pages-list" className="border-b p-2 border-app">
      <div className="mb-1 flex items-center justify-between px-1">
        <span className="text-xs font-medium text-secondary-app">Pages</span>
        <button type="button" data-testid="add-page-button" className="text-xs bg-hover-app rounded px-1" onClick={addPage}>
          +
        </button>
      </div>
      <ul>
        {pageIds.map((id) => {
          const node = doc.getNode(id);
          if (!node) return null;
          return (
            <li key={id}>
              {renamingId === id ? (
                <input
                  autoFocus
                  className="w-full rounded px-1 py-0.5 text-xs"
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  onBlur={() => commitRename(id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename(id);
                    if (e.key === 'Escape') setRenamingId(null);
                  }}
                />
              ) : (
                <button
                  type="button"
                  data-testid={`page-${id}`}
                  className="w-full rounded px-1 py-0.5 text-left text-xs bg-hover-app"
                  style={id === activePageId ? { backgroundColor: 'var(--bg-active)' } : undefined}
                  onClick={() => onSelectPage(id)}
                  onDoubleClick={() => startRename(id, node.name)}
                >
                  {node.name}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
