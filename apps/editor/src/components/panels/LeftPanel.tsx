import type { OpenDoc } from '@openmake/core';
import { PagesList } from './PagesList.js';
import { LayersTree } from './LayersTree.js';

export interface LeftPanelProps {
  doc: OpenDoc;
  activePageId: string;
  onSelectPage: (id: string) => void;
}

export function LeftPanel({ doc, activePageId, onSelectPage }: LeftPanelProps) {
  return (
    <div className="flex w-panel-left shrink-0 flex-col border-r bg-panel border-app" data-testid="left-panel">
      <PagesList doc={doc} activePageId={activePageId} onSelectPage={onSelectPage} />
      <LayersTree doc={doc} pageId={activePageId} />
    </div>
  );
}
