import { useState } from 'react';
import type { OpenDoc } from '@openmake/core';
import type { Paint, SceneNode } from '@openmake/shared';
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
  const fills = node.fills ?? [];

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
          onChange={(next) => commit(fills.map((f, i) => (i === index ? next : f)))}
          onRemove={() => commit(fills.filter((_, i) => i !== index))}
        />
      ))}
    </div>
  );
}

function FillRow({
  fill,
  onChange,
  onRemove,
}: {
  fill: Paint;
  onChange: (fill: Paint) => void;
  onRemove: () => void;
}) {
  const [hexDraft, setHexDraft] = useState(
    fill.type === 'SOLID' ? colorToHex(fill.color) : '#000000',
  );

  if (fill.type !== 'SOLID') {
    return (
      <div className="flex items-center justify-between py-0.5 text-xs text-secondary-app">
        <span>{fill.type}</span>
        <button type="button" onClick={onRemove}>
          ✕
        </button>
      </div>
    );
  }

  const commitHex = () => {
    const color = hexToColor(hexDraft);
    if (color) onChange({ ...fill, color: { ...color, a: fill.color.a } });
  };

  return (
    <div className="flex items-center gap-1 py-0.5">
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
        data-testid="toggle-fill-visibility"
        className="text-xs text-secondary-app"
        onClick={() => onChange({ ...fill, visible: !fill.visible })}
      >
        {fill.visible ? '👁' : '—'}
      </button>
      <button
        type="button"
        data-testid="remove-fill-button"
        className="text-xs text-secondary-app"
        onClick={onRemove}
      >
        ✕
      </button>
    </div>
  );
}
