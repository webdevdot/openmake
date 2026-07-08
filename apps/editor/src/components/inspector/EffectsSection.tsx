import type { OpenDoc } from '@openmake/core';
import type { Effect, SceneNode } from '@openmake/shared';
import { colorToHex, hexToColor } from '../../lib/color.js';

export interface EffectsSectionProps {
  doc: OpenDoc;
  node: Extract<SceneNode, { effects: Effect[] }>;
}

const NEW_DROP_SHADOW: Effect = {
  type: 'DROP_SHADOW',
  color: { r: 0, g: 0, b: 0, a: 0.25 },
  offset: { x: 0, y: 4 },
  blur: 8,
  spread: 0,
  visible: true,
};

export function EffectsSection({ doc, node }: EffectsSectionProps) {
  const effects = node.effects ?? [];

  const commit = (next: Effect[]) => {
    doc.updateNode(node.id, { effects: next });
    doc.commitUndoGroup();
  };

  return (
    <div className="border-b p-2 border-app" data-testid="effects-section">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-medium text-secondary-app">Effects</span>
        <button
          type="button"
          data-testid="add-drop-shadow-button"
          className="rounded px-1 text-xs bg-hover-app"
          onClick={() => commit([...effects, NEW_DROP_SHADOW])}
        >
          +
        </button>
      </div>
      {effects.map((effect, index) => {
        if (effect.type !== 'DROP_SHADOW' && effect.type !== 'INNER_SHADOW') {
          return (
            <div key={index} className="flex items-center justify-between py-0.5 text-xs">
              <span>{effect.type}</span>
              <button type="button" onClick={() => commit(effects.filter((_, i) => i !== index))}>
                ✕
              </button>
            </div>
          );
        }
        return (
          <div key={index} className="flex items-center gap-1 py-0.5">
            <input
              type="color"
              className="h-5 w-5 shrink-0 rounded border p-0 border-app"
              value={colorToHex(effect.color)}
              onChange={(e) => {
                const c = hexToColor(e.target.value);
                if (!c) return;
                const next = [...effects];
                next[index] = { ...effect, color: { ...c, a: effect.color.a } };
                commit(next);
              }}
            />
            <input
              type="number"
              title="Offset X"
              className="w-10 rounded border bg-transparent px-1 py-0.5 text-xs border-app"
              value={effect.offset.x}
              onChange={(e) => {
                const next = [...effects];
                next[index] = {
                  ...effect,
                  offset: { ...effect.offset, x: Number(e.target.value) },
                };
                commit(next);
              }}
            />
            <input
              type="number"
              title="Offset Y"
              className="w-10 rounded border bg-transparent px-1 py-0.5 text-xs border-app"
              value={effect.offset.y}
              onChange={(e) => {
                const next = [...effects];
                next[index] = {
                  ...effect,
                  offset: { ...effect.offset, y: Number(e.target.value) },
                };
                commit(next);
              }}
            />
            <input
              type="number"
              title="Blur"
              min={0}
              data-testid="shadow-blur-input"
              className="w-10 rounded border bg-transparent px-1 py-0.5 text-xs border-app"
              value={effect.blur}
              onChange={(e) => {
                const next = [...effects];
                next[index] = { ...effect, blur: Math.max(0, Number(e.target.value)) };
                commit(next);
              }}
            />
            <button
              type="button"
              data-testid="remove-effect-button"
              className="text-xs text-secondary-app"
              onClick={() => commit(effects.filter((_, i) => i !== index))}
            >
              ✕
            </button>
          </div>
        );
      })}
    </div>
  );
}
