import type { OpenDoc } from '@openmake/core';
import type { SceneNode, Stroke } from '@openmake/shared';
import { colorToHex, hexToColor } from '../../lib/color.js';

export interface StrokesSectionProps {
  doc: OpenDoc;
  node: Extract<SceneNode, { strokes: Stroke[] }>;
}

const NEW_STROKE: Stroke = {
  paint: { type: 'SOLID', color: { r: 0, g: 0, b: 0, a: 1 }, opacity: 1, visible: true },
  weight: 1,
  align: 'INSIDE',
};

export function StrokesSection({ doc, node }: StrokesSectionProps) {
  const strokes = node.strokes ?? [];

  const commit = (next: Stroke[]) => {
    doc.updateNode(node.id, { strokes: next });
    doc.commitUndoGroup();
  };

  return (
    <div className="border-b p-2 border-app" data-testid="strokes-section">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-medium text-secondary-app">Stroke</span>
        <button
          type="button"
          data-testid="add-stroke-button"
          className="rounded px-1 text-xs bg-hover-app"
          onClick={() => commit([...strokes, NEW_STROKE])}
        >
          +
        </button>
      </div>
      {strokes.map((stroke, index) => {
        const color = stroke.paint.type === 'SOLID' ? stroke.paint.color : { r: 0, g: 0, b: 0, a: 1 };
        return (
          <div key={index} className="flex items-center gap-1 py-0.5">
            <input
              type="color"
              className="h-5 w-5 shrink-0 rounded border p-0 border-app"
              value={colorToHex(color)}
              onChange={(e) => {
                const c = hexToColor(e.target.value);
                if (!c || stroke.paint.type !== 'SOLID') return;
                const next = [...strokes];
                next[index] = { ...stroke, paint: { ...stroke.paint, color: { ...c, a: color.a } } };
                commit(next);
              }}
            />
            <input
              type="number"
              min={0}
              data-testid="stroke-weight-input"
              className="w-14 rounded border bg-transparent px-1 py-0.5 text-xs border-app"
              value={stroke.weight}
              onChange={(e) => {
                const next = [...strokes];
                next[index] = { ...stroke, weight: Math.max(0, Number(e.target.value)) };
                commit(next);
              }}
            />
            <select
              data-testid="stroke-align-select"
              className="rounded border bg-transparent px-1 py-0.5 text-xs border-app"
              value={stroke.align}
              onChange={(e) => {
                const next = [...strokes];
                next[index] = { ...stroke, align: e.target.value as Stroke['align'] };
                commit(next);
              }}
            >
              <option value="INSIDE">Inside</option>
              <option value="CENTER">Center</option>
              <option value="OUTSIDE">Outside</option>
            </select>
            <button
              type="button"
              data-testid="remove-stroke-button"
              className="text-xs text-secondary-app"
              onClick={() => commit(strokes.filter((_, i) => i !== index))}
            >
              ✕
            </button>
          </div>
        );
      })}
    </div>
  );
}
