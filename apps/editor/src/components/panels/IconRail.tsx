import { FileText, Sparkles, Component, Wrench, Variable } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type RailSection = 'file' | 'agents' | 'assets' | 'tools' | 'variables';

const RAIL_ITEMS: Array<{ id: RailSection; label: string; icon: LucideIcon }> = [
  { id: 'file', label: 'File', icon: FileText },
  { id: 'agents', label: 'Agents', icon: Sparkles },
  { id: 'assets', label: 'Assets', icon: Component },
  { id: 'tools', label: 'Tools', icon: Wrench },
  { id: 'variables', label: 'Variables', icon: Variable },
];

export interface IconRailProps {
  active: RailSection;
  onSelect: (section: RailSection) => void;
}

/**
 * Left-most vertical icon rail. Only `file` has real content today (the
 * pages/layers panel) — the rest are inert placeholders matching Figma's
 * chrome; wiring them up is separate feature work (agents/assets/variables
 * systems), not part of this layout pass.
 */
export function IconRail({ active, onSelect }: IconRailProps) {
  return (
    <div
      className="flex w-rail shrink-0 flex-col items-center gap-1 border-r bg-rail border-app py-2"
      data-testid="icon-rail"
    >
      {RAIL_ITEMS.map((item) => {
        const Icon = item.icon;
        const isActive = item.id === active;
        return (
          <button
            key={item.id}
            type="button"
            data-testid={`rail-${item.id}`}
            aria-pressed={isActive}
            title={item.label}
            className="flex w-12 flex-col items-center gap-0.5 rounded py-1.5 text-rail-fg bg-hover-app"
            style={isActive ? { backgroundColor: 'var(--bg-active)' } : undefined}
            onClick={() => onSelect(item.id)}
          >
            <Icon size={18} strokeWidth={1.75} />
            <span className="text-[9px] leading-none">{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
