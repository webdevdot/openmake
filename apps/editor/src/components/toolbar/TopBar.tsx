import type { OpenDoc } from '@openmake/core';
import { FileText } from 'lucide-react';
import { PresenceAvatars } from './PresenceAvatars.js';
import type { CollabStatus } from '../../hooks/useCollab.js';

export interface TopBarProps {
  doc: OpenDoc;
  status: CollabStatus;
  onExportPNG: () => void;
  onExportSVG: () => void;
  onPresent: () => void;
}

/**
 * Slim top bar: file identity + undo/redo + collab/export/present actions.
 * Tool selection lives in the floating BottomToolbar and the Design/Prototype
 * tabs + zoom menu live at the top of the right panel (RightPanelHeader) —
 * matching Figma UI3's chrome split.
 */
export function TopBar({ doc, status, onExportPNG, onExportSVG, onPresent }: TopBarProps) {
  return (
    <div
      className="flex h-toolbar shrink-0 items-center justify-between border-b bg-toolbar px-3 border-app"
      data-testid="top-bar"
    >
      <div className="flex items-center gap-3">
        <FileText size={17} strokeWidth={1.75} className="text-secondary-app" aria-hidden />
        <span className="text-xs font-medium text-primary-app">{doc.name}</span>
        <span
          data-testid="doc-draft-badge"
          className="rounded border px-1.5 py-0.5 text-[10px] border-app text-secondary-app"
        >
          Draft
        </span>
        <button
          type="button"
          data-testid="undo-button"
          className="rounded px-2 py-1 text-xs bg-hover-app"
          disabled={!doc.canUndo()}
          onClick={() => doc.undo()}
        >
          Undo
        </button>
        <button
          type="button"
          data-testid="redo-button"
          className="rounded px-2 py-1 text-xs bg-hover-app"
          disabled={!doc.canRedo()}
          onClick={() => doc.redo()}
        >
          Redo
        </button>
      </div>

      <div className="flex items-center gap-2">
        <span
          data-testid="collab-status"
          className="rounded px-2 py-0.5 text-xs text-secondary-app"
          title={`Collab: ${status}`}
        >
          {status === 'connected'
            ? 'Connected'
            : status === 'connecting'
              ? 'Connecting…'
              : 'Offline'}
        </span>
        <button
          type="button"
          className="rounded px-2 py-1 text-xs bg-hover-app"
          onClick={onExportPNG}
        >
          Export PNG
        </button>
        <button
          type="button"
          className="rounded px-2 py-1 text-xs bg-hover-app"
          onClick={onExportSVG}
        >
          Export SVG
        </button>
        <PresenceAvatars />
        <button
          type="button"
          data-testid="present-button"
          className="rounded px-2 py-1 text-xs font-medium text-white bg-accent-cta"
          onClick={onPresent}
        >
          Present
        </button>
        <button
          type="button"
          className="rounded px-2 py-1 text-xs font-medium text-secondary-app bg-hover-app"
          disabled
          title="Coming soon"
        >
          Share
        </button>
      </div>
    </div>
  );
}
