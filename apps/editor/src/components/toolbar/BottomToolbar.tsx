import {
  MousePointer2,
  Frame,
  Square,
  Circle,
  Minus,
  PenTool,
  Type,
  Hand,
  MessageCircle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useToolStore, type ToolId } from '../../store/tool.js';

const TOOLS: Array<{ id: ToolId; label: string; shortcut: string; icon: LucideIcon }> = [
  { id: 'select', label: 'Select', shortcut: 'V', icon: MousePointer2 },
  { id: 'frame', label: 'Frame', shortcut: 'F', icon: Frame },
  { id: 'rectangle', label: 'Rectangle', shortcut: 'R', icon: Square },
  { id: 'ellipse', label: 'Ellipse', shortcut: 'O', icon: Circle },
  { id: 'line', label: 'Line', shortcut: 'L', icon: Minus },
  { id: 'pen', label: 'Pen', shortcut: 'P', icon: PenTool },
  { id: 'text', label: 'Text', shortcut: 'T', icon: Type },
  { id: 'hand', label: 'Hand tool', shortcut: 'H', icon: Hand },
];

/**
 * Floating pill toolbar centered over the canvas, matching Figma's bottom
 * tool dock. All existing tools stay directly reachable (no flyout submenu —
 * that's an interaction-pattern change beyond this pass's layout scope).
 * Comment is a visual-parity placeholder; no commenting system exists yet.
 */
export function BottomToolbar() {
  const tool = useToolStore((s) => s.tool);
  const setTool = useToolStore((s) => s.setTool);

  return (
    <div
      className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-0.5 rounded-xl bg-floating-app px-1.5 py-1 shadow-lg"
      data-testid="toolbar"
    >
      {TOOLS.map((t) => {
        const Icon = t.icon;
        const isActive = tool === t.id;
        return (
          <button
            key={t.id}
            type="button"
            title={`${t.label} (${t.shortcut})`}
            data-testid={`tool-${t.id}`}
            aria-pressed={isActive}
            className="flex h-8 w-9 items-center justify-center rounded-lg text-zinc-100 hover:bg-white/10"
            style={isActive ? { backgroundColor: 'var(--color-accent)' } : undefined}
            onClick={() => setTool(t.id)}
          >
            <Icon size={17} strokeWidth={1.75} />
          </button>
        );
      })}
      <div className="mx-1 h-5 w-px bg-white/15" />
      <button
        type="button"
        title="Comment"
        disabled
        className="flex h-8 w-9 items-center justify-center rounded-lg text-zinc-500"
      >
        <MessageCircle size={17} strokeWidth={1.75} />
      </button>
    </div>
  );
}
