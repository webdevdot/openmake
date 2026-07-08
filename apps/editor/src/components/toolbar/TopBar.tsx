import type { OpenDoc } from '@openmake/core';
import { FileText } from 'lucide-react';
import { ZoomMenu } from './ZoomMenu.js';
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
 * Slim top bar: file identity + collab/export/present actions. Tool
 * selection lives in the floating BottomToolbar (matches Figma's split
 * between top chrome and the bottom tool dock).
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
        <div
          className="flex items-center gap-1 rounded-lg p-0.5 text-xs"
          style={{ backgroundColor: 'var(--bg-hover)' }}
        >
          {/* bg-panel + border reads as a raised pill against the --bg-hover
              track in both themes; --bg-active alone was ~1.5:1 vs the track. */}
          <span
            className="rounded border px-2 py-1 font-medium border-app shadow-sm"
            style={{ backgroundColor: 'var(--bg-panel)' }}
          >
            Design
          </span>
          <span className="rounded px-2 py-1 text-secondary-app">Prototype</span>
        </div>
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
        <ZoomMenu />
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
          className="rounded px-2 py-1 text-xs font-medium text-white bg-accent-cta"
          disabled
          title="Coming soon"
        >
          Share
        </button>
      </div>
    </div>
  );
}
