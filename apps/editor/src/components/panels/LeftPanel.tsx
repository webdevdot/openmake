import { useState } from 'react';
import type { OpenDoc } from '@openmake/core';
import { PagesList } from './PagesList.js';
import { LayersTree } from './LayersTree.js';
import { AgentsPanel } from './AgentsPanel.js';
import { AssetsPanel } from './AssetsPanel.js';
import { ToolsPanel } from './ToolsPanel.js';
import { IconRail, type RailSection } from './IconRail.js';

export interface LeftPanelProps {
  doc: OpenDoc;
  fileId: string;
  activePageId: string;
  onSelectPage: (id: string) => void;
  /** World-space point where new instances land (current viewport center). */
  getViewportCenter: () => { x: number; y: number };
  onExportPNG: (nodeId: string, scale: 1 | 2) => void;
  onExportSVG: (nodeId: string) => void;
}

export function LeftPanel({
  doc,
  fileId,
  activePageId,
  onSelectPage,
  getViewportCenter,
  onExportPNG,
  onExportSVG,
}: LeftPanelProps) {
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
      {section === 'agents' && (
        <div className="flex w-panel-left shrink-0 flex-col border-r bg-panel border-app">
          <AgentsPanel doc={doc} fileId={fileId} />
        </div>
      )}
      {section === 'assets' && (
        <AssetsPanel doc={doc} activePageId={activePageId} getViewportCenter={getViewportCenter} />
      )}
      {section === 'tools' && (
        <ToolsPanel doc={doc} onExportPNG={onExportPNG} onExportSVG={onExportSVG} />
      )}
    </div>
  );
}
