import { useState } from 'react';
import type { OpenDoc } from '@openmake/core';
import { PagesList } from './PagesList.js';
import { LayersTree } from './LayersTree.js';
import { VariablesPanel } from './VariablesPanel.js';
import { IconRail, type RailSection } from './IconRail.js';

export interface LeftPanelProps {
  doc: OpenDoc;
  activePageId: string;
  onSelectPage: (id: string) => void;
}

export function LeftPanel({ doc, activePageId, onSelectPage }: LeftPanelProps) {
  const [section, setSection] = useState<RailSection>('file');

  return (
    <div className="flex shrink-0" data-testid="left-panel">
      <IconRail active={section} onSelect={setSection} />
      {section === 'file' && (
        <div className="flex w-panel-left shrink-0 flex-col border-r bg-panel border-app">
          <PagesList doc={doc} activePageId={activePageId} onSelectPage={onSelectPage} />
          <LayersTree doc={doc} pageId={activePageId} />
        </div>
      )}
      {section === 'variables' && <VariablesPanel doc={doc} />}
    </div>
  );
}
