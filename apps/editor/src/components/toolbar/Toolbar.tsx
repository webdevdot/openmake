import { useToolStore, type ToolId } from '../../store/tool.js';
import type { OpenDoc } from '@openmake/core';
import { ZoomMenu } from './ZoomMenu.js';
import { PresenceAvatars } from './PresenceAvatars.js';
import type { CollabStatus } from '../../hooks/useCollab.js';

const TOOLS: Array<{ id: ToolId; label: string; shortcut: string }> = [
  { id: 'select', label: 'Select', shortcut: 'V' },
  { id: 'frame', label: 'Frame', shortcut: 'F' },
  { id: 'rectangle', label: 'Rectangle', shortcut: 'R' },
  { id: 'ellipse', label: 'Ellipse', shortcut: 'O' },
  { id: 'line', label: 'Line', shortcut: 'L' },
  { id: 'text', label: 'Text', shortcut: 'T' },
  { id: 'hand', label: 'Hand', shortcut: 'H' },
];

export interface ToolbarProps {
  doc: OpenDoc;
  status: CollabStatus;
  onExportPNG: () => void;
  onExportSVG: () => void;
  onPresent: () => void;
}

export function Toolbar({ doc, status, onExportPNG, onExportSVG, onPresent }: ToolbarProps) {
  const tool = useToolStore((s) => s.tool);
  const setTool = useToolStore((s) => s.setTool);

  return (
    <div
      className="flex h-toolbar shrink-0 items-center justify-between border-b bg-toolbar px-2 border-app"
      data-testid="toolbar"
    >
      <div className="flex items-center gap-1">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            type="button"
            title={`${t.label} (${t.shortcut})`}
            data-testid={`tool-${t.id}`}
            aria-pressed={tool === t.id}
            className="rounded px-2 py-1 text-xs bg-hover-app"
            style={tool === t.id ? { backgroundColor: 'var(--bg-active)' } : undefined}
            onClick={() => setTool(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2">
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
        <ZoomMenu />
      </div>

      <div className="flex items-center gap-3">
        <span
          data-testid="collab-status"
          className="rounded px-2 py-0.5 text-xs text-secondary-app"
          title={`Collab: ${status}`}
        >
          {status === 'connected' ? 'Connected' : status === 'connecting' ? 'Connecting…' : 'Offline'}
        </span>
        <button type="button" className="rounded px-2 py-1 text-xs bg-hover-app" onClick={onExportPNG}>
          Export PNG
        </button>
        <button type="button" className="rounded px-2 py-1 text-xs bg-hover-app" onClick={onExportSVG}>
          Export SVG
        </button>
        <PresenceAvatars />
        <button
          type="button"
          data-testid="present-button"
          className="rounded px-2 py-1 text-xs font-medium text-white"
          style={{ backgroundColor: 'var(--color-accent)' }}
          onClick={onPresent}
        >
          Present
        </button>
        <button type="button" className="rounded px-2 py-1 text-xs bg-hover-app" disabled title="Coming soon">
          Share
        </button>
      </div>
    </div>
  );
}
