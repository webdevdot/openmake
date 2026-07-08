import { useState } from 'react';
import { Link2 } from 'lucide-react';
import type { OpenDoc } from '@openmake/core';
import type { Paint, SceneNode, Variable } from '@openmake/shared';
import { useDocVersion } from '../../hooks/document.js';
import { colorToHex, hexToColor } from '../../lib/color.js';

export interface FillsSectionProps {
  doc: OpenDoc;
  node: Extract<SceneNode, { fills: Paint[] }>;
}

const NEW_FILL: Paint = {
  type: 'SOLID',
  color: { r: 0.8, g: 0.8, b: 0.8, a: 1 },
  opacity: 1,
  visible: true,
};

export function FillsSection({ doc, node }: FillsSectionProps) {
  useDocVersion(doc);
  const fills = node.fills ?? [];
  // Variables v1: only COLOR variables can bind to a solid fill's color.
  const colorVariables = Object.values(doc.getVariables()).filter((v) => v.type === 'COLOR');

  const commit = (next: Paint[]) => {
    doc.updateNode(node.id, { fills: next });
    doc.commitUndoGroup();
  };

  return (
    <div className="border-b p-2 border-app" data-testid="fills-section">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-medium text-secondary-app">Fills</span>
        <button
          type="button"
          aria-label="Add fill"
          title="Add fill"
          data-testid="add-fill-button"
          className="rounded px-1 text-xs bg-hover-app"
          onClick={() => commit([...fills, NEW_FILL])}
        >
          +
        </button>
      </div>
      {fills.map((fill, index) => (
        <FillRow
          key={index}
          fill={fill}
          colorVariables={colorVariables}
          onChange={(next) => commit(fills.map((f, i) => (i === index ? next : f)))}
          onRemove={() => commit(fills.filter((_, i) => i !== index))}
        />
      ))}
    </div>
  );
}

function FillRow({
  fill,
  colorVariables,
  onChange,
  onRemove,
}: {
  fill: Paint;
  colorVariables: Variable[];
  onChange: (fill: Paint) => void;
  onRemove: () => void;
}) {
  const [hexDraft, setHexDraft] = useState(
    fill.type === 'SOLID' ? colorToHex(fill.color) : '#000000',
  );
  const [picking, setPicking] = useState(false);

  if (fill.type !== 'SOLID') {
    return (
      <div className="flex items-center justify-between py-0.5 text-xs text-secondary-app">
        <span>{fill.type}</span>
        <button type="button" aria-label="Remove fill" title="Remove fill" onClick={onRemove}>
          ✕
        </button>
      </div>
    );
  }

  const boundVariable = fill.boundVariableId
    ? colorVariables.find((v) => v.id === fill.boundVariableId)
    : undefined;

  // Editing the hex/swatch while a variable is bound first UNBINDS the fill,
  // so a manual color edit never silently competes with the variable.
  const commitHex = () => {
    const color = hexToColor(hexDraft);
    if (color) onChange({ ...fill, color: { ...color, a: fill.color.a }, boundVariableId: null });
  };

  const bind = (variableId: string) => {
    onChange({ ...fill, boundVariableId: variableId });
    setPicking(false);
  };

  const unbind = () => onChange({ ...fill, boundVariableId: null });

  // A bound fill shows the variable name + an unbind button instead of the
  // hex/alpha editors (the color comes from the variable's active-mode value).
  if (boundVariable) {
    return (
      <div className="flex items-center gap-1 py-0.5" data-testid="fill-bound">
        <span
          className="h-5 w-5 shrink-0 rounded border border-app"
          style={{ backgroundColor: colorToHex(fill.color) }}
        />
        <span className="flex-1 truncate text-xs" data-testid="fill-bound-name">
          {boundVariable.name}
        </span>
        <button
          type="button"
          aria-label="Unbind variable"
          data-testid="unbind-fill-button"
          title="Unbind variable"
          className="text-xs text-secondary-app"
          onClick={unbind}
        >
          ✕
        </button>
        <button
          type="button"
          aria-label="Remove fill"
          title="Remove fill"
          data-testid="remove-fill-button"
          className="text-xs text-secondary-app"
          onClick={onRemove}
        >
          🗑
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0.5 py-0.5">
      <div className="flex items-center gap-1">
        <input
          type="color"
          data-testid="fill-swatch"
          className="h-5 w-5 shrink-0 rounded border p-0 border-app"
          value={colorToHex(fill.color)}
          onChange={(e) => {
            const color = hexToColor(e.target.value);
            if (color) onChange({ ...fill, color: { ...color, a: fill.color.a } });
          }}
        />
        <input
          type="text"
          data-testid="fill-hex-input"
          className="w-20 rounded border bg-transparent px-1 py-0.5 text-xs border-app"
          value={hexDraft}
          onChange={(e) => setHexDraft(e.target.value)}
          onBlur={commitHex}
          onKeyDown={(e) => e.key === 'Enter' && commitHex()}
        />
        <input
          type="number"
          min={0}
          max={100}
          data-testid="fill-alpha-input"
          className="w-12 rounded border bg-transparent px-1 py-0.5 text-xs border-app"
          value={Math.round(fill.color.a * 100)}
          onChange={(e) =>
            onChange({ ...fill, color: { ...fill.color, a: Number(e.target.value) / 100 } })
          }
        />
        <button
          type="button"
          aria-label="Bind to variable"
          data-testid="bind-variable-button"
          title="Bind to variable"
          className="text-secondary-app disabled:opacity-40"
          disabled={colorVariables.length === 0}
          onClick={() => setPicking((p) => !p)}
        >
          <Link2 size={13} strokeWidth={1.75} />
        </button>
        <button
          type="button"
          aria-label={fill.visible ? 'Hide fill' : 'Show fill'}
          title={fill.visible ? 'Hide fill' : 'Show fill'}
          data-testid="toggle-fill-visibility"
          className="text-xs text-secondary-app"
          onClick={() => onChange({ ...fill, visible: !fill.visible })}
        >
          {fill.visible ? '👁' : '—'}
        </button>
        <button
          type="button"
          aria-label="Remove fill"
          title="Remove fill"
          data-testid="remove-fill-button"
          className="text-xs text-secondary-app"
          onClick={onRemove}
        >
          ✕
        </button>
      </div>
      {picking && colorVariables.length > 0 && (
        <ul className="ml-6 flex flex-col gap-0.5" data-testid="variable-picker">
          {colorVariables.map((v) => (
            <li key={v.id}>
              <button
                type="button"
                data-testid={`pick-variable-${v.id}`}
                className="w-full rounded px-1 py-0.5 text-left text-xs bg-hover-app"
                onClick={() => bind(v.id)}
              >
                {v.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
