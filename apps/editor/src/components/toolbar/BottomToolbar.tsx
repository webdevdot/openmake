import { useEffect, useRef, useState } from 'react';
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
  Hexagon,
  Star,
  Image,
  ChevronUp,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useToolStore, type ToolId } from '../../store/tool.js';

interface ToolDef {
  id: ToolId;
  label: string;
  shortcut: string;
  icon: LucideIcon;
}

const SELECT: ToolDef = { id: 'select', label: 'Select', shortcut: 'V', icon: MousePointer2 };
const FRAME: ToolDef = { id: 'frame', label: 'Frame', shortcut: 'F', icon: Frame };
const PEN: ToolDef = { id: 'pen', label: 'Pen', shortcut: 'P', icon: PenTool };
const TEXT: ToolDef = { id: 'text', label: 'Text', shortcut: 'T', icon: Type };
const HAND: ToolDef = { id: 'hand', label: 'Hand tool', shortcut: 'H', icon: Hand };

/** Shapes that share the single grouped slot with a flyout (Figma pattern). */
const SHAPE_TOOLS: ToolDef[] = [
  { id: 'rectangle', label: 'Rectangle', shortcut: 'R', icon: Square },
  { id: 'ellipse', label: 'Ellipse', shortcut: 'O', icon: Circle },
  { id: 'line', label: 'Line', shortcut: 'L', icon: Minus },
  { id: 'polygon', label: 'Polygon', shortcut: 'G', icon: Hexagon },
  { id: 'star', label: 'Star', shortcut: 'S', icon: Star },
  { id: 'image', label: 'Place image', shortcut: 'K', icon: Image },
];

const SHAPE_IDS = new Set<ToolId>(SHAPE_TOOLS.map((t) => t.id));

function ToolButton({
  tool,
  active,
  onSelect,
}: {
  tool: ToolDef;
  active: boolean;
  onSelect: (id: ToolId) => void;
}) {
  const Icon = tool.icon;
  return (
    <button
      type="button"
      title={`${tool.label} (${tool.shortcut})`}
      aria-label={tool.label}
      data-testid={`tool-${tool.id}`}
      aria-pressed={active}
      className="flex h-8 w-9 items-center justify-center rounded-lg text-zinc-100 hover:bg-white/10"
      style={active ? { backgroundColor: 'var(--color-accent)' } : undefined}
      onClick={() => onSelect(tool.id)}
    >
      <Icon size={17} strokeWidth={1.75} />
    </button>
  );
}

/**
 * Floating pill toolbar centered over the canvas, matching Figma's bottom
 * tool dock. Fixed slots (select, frame, pen, text, hand) sit inline; the six
 * shape tools collapse into a single grouped slot that shows the last-used
 * shape with a chevron and opens a flyout to pick another. Keyboard shortcuts
 * still select every tool directly (see shortcuts.ts) even when a shape is
 * hidden inside the flyout. Comment is a visual-parity placeholder.
 */
export function BottomToolbar() {
  const tool = useToolStore((s) => s.tool);
  const setTool = useToolStore((s) => s.setTool);
  const [lastShapeId, setLastShapeId] = useState<ToolId>('rectangle');
  const [flyoutOpen, setFlyoutOpen] = useState(false);
  const shapeSlotRef = useRef<HTMLDivElement | null>(null);

  // Keep the shape slot showing whichever shape tool is active — including when
  // a shape is chosen via keyboard shortcut while hidden in the flyout.
  useEffect(() => {
    if (SHAPE_IDS.has(tool)) setLastShapeId(tool);
  }, [tool]);

  useEffect(() => {
    if (!flyoutOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (shapeSlotRef.current?.contains(e.target as Node)) return;
      setFlyoutOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFlyoutOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [flyoutOpen]);

  const activeShape = SHAPE_TOOLS.find((t) => t.id === lastShapeId) ?? SHAPE_TOOLS[0]!;
  const ShapeIcon = activeShape.icon;
  const shapeActive = SHAPE_IDS.has(tool);

  const pickShape = (id: ToolId) => {
    setTool(id);
    setLastShapeId(id);
    setFlyoutOpen(false);
  };

  return (
    <div
      className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-0.5 rounded-xl bg-floating-app px-1.5 py-1 shadow-lg"
      data-testid="toolbar"
    >
      <ToolButton tool={SELECT} active={tool === SELECT.id} onSelect={setTool} />
      <ToolButton tool={FRAME} active={tool === FRAME.id} onSelect={setTool} />

      {/* Grouped shape slot: last-used shape + chevron, opens a flyout above. */}
      <div className="relative" ref={shapeSlotRef} data-testid="shape-slot">
        <button
          type="button"
          title={`${activeShape.label} (${activeShape.shortcut})`}
          aria-label={activeShape.label}
          data-testid="tool-shape"
          aria-pressed={shapeActive}
          aria-haspopup="menu"
          aria-expanded={flyoutOpen}
          className="flex h-8 items-center gap-0.5 rounded-lg pl-2 pr-1 text-zinc-100 hover:bg-white/10"
          style={shapeActive ? { backgroundColor: 'var(--color-accent)' } : undefined}
          onClick={() => {
            setTool(activeShape.id);
            setFlyoutOpen((o) => !o);
          }}
        >
          <ShapeIcon size={17} strokeWidth={1.75} />
          <ChevronUp size={11} strokeWidth={2} className="opacity-70" />
        </button>
        {flyoutOpen && (
          <div
            role="menu"
            data-testid="shape-flyout"
            className="absolute bottom-full left-1/2 z-10 mb-2 flex -translate-x-1/2 flex-col gap-0.5 rounded-lg bg-floating-app p-1 shadow-lg"
          >
            {SHAPE_TOOLS.map((t) => {
              const Icon = t.icon;
              const isActive = tool === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="menuitem"
                  data-testid={`tool-${t.id}`}
                  aria-label={t.label}
                  aria-pressed={isActive}
                  className="flex h-8 items-center gap-2 rounded-lg px-2 text-left text-xs text-zinc-100 hover:bg-white/10"
                  style={isActive ? { backgroundColor: 'var(--color-accent)' } : undefined}
                  onClick={() => pickShape(t.id)}
                >
                  <Icon size={17} strokeWidth={1.75} />
                  <span className="flex-1 whitespace-nowrap">{t.label}</span>
                  <span className="text-zinc-400">{t.shortcut}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <ToolButton tool={PEN} active={tool === PEN.id} onSelect={setTool} />
      <ToolButton tool={TEXT} active={tool === TEXT.id} onSelect={setTool} />
      <ToolButton tool={HAND} active={tool === HAND.id} onSelect={setTool} />

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
