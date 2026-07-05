import type { OpenDoc } from '@openmake/core';
import type { SceneNode } from '@openmake/shared';
import { NumberField } from './NumberField.js';

export interface GeometrySectionProps {
  doc: OpenDoc;
  node: SceneNode;
}

export function GeometrySection({ doc, node }: GeometrySectionProps) {
  const update = (props: Record<string, unknown>) => {
    doc.updateNode(node.id, props);
    doc.commitUndoGroup();
  };

  const hasCornerRadius = 'cornerRadius' in node;

  return (
    <div className="grid grid-cols-2 gap-2 border-b p-2 border-app" data-testid="geometry-section">
      <NumberField label="X" value={node.x} onCommit={(v) => update({ x: v })} testId="input-x" />
      <NumberField label="Y" value={node.y} onCommit={(v) => update({ y: v })} testId="input-y" />
      <NumberField label="W" value={node.width} onCommit={(v) => update({ width: Math.max(0, v) })} testId="input-w" />
      <NumberField label="H" value={node.height} onCommit={(v) => update({ height: Math.max(0, v) })} testId="input-h" />
      <NumberField label="∠" value={node.rotation} onCommit={(v) => update({ rotation: v })} testId="input-rotation" />
      {hasCornerRadius && (
        <NumberField
          label="⌒"
          value={(node as { cornerRadius: number }).cornerRadius}
          onCommit={(v) => update({ cornerRadius: Math.max(0, v) })}
          testId="input-corner-radius"
        />
      )}
      <label className="col-span-2 flex items-center gap-2 text-xs">
        <span className="w-12 text-secondary-app">Opacity</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={node.opacity}
          data-testid="input-opacity"
          className="flex-1"
          onChange={(e) => doc.updateNode(node.id, { opacity: Number(e.target.value) })}
          onPointerUp={() => doc.commitUndoGroup()}
        />
        <span className="w-8 text-right text-secondary-app">{Math.round(node.opacity * 100)}%</span>
      </label>
    </div>
  );
}
