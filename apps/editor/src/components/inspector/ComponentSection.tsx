import type { OpenDoc } from '@openmake/core';
import { findVariant, variantMatrixOf, variantPropsOf } from '@openmake/core';
import type { SceneNode } from '@openmake/shared';
import { useSelectionStore } from '../../store/selection.js';

export interface ComponentSectionProps {
  doc: OpenDoc;
  node: SceneNode;
}

/** Offset (px) applied to a new instance so it doesn't sit exactly on its source. */
const INSTANCE_OFFSET = 40;

/** Walk up to the nearest PAGE ancestor so instances land on the canvas, not inside a set. */
function pageAncestor(doc: OpenDoc, id: string): string | undefined {
  for (let cur: string | undefined = id; cur; cur = doc.getParentId(cur)) {
    const parentId = doc.getParentId(cur);
    if (!parentId) return undefined;
    if (doc.getNode(parentId)?.type === 'PAGE') return parentId;
  }
  return undefined;
}

export function ComponentSection({ doc, node }: ComponentSectionProps) {
  const setSelection = useSelectionStore((s) => s.set);

  if (node.type === 'FRAME') {
    return (
      <div className="border-b p-2 border-app" data-testid="component-section">
        <button
          type="button"
          data-testid="create-component-button"
          className="w-full rounded py-1 text-xs bg-hover-app"
          onClick={() => {
            doc.createComponentFromNode(node.id);
            doc.commitUndoGroup();
          }}
        >
          Create component
        </button>
      </div>
    );
  }

  if (node.type === 'COMPONENT') {
    const parent = doc.getParentId(node.id);
    const inSet = parent && doc.getNode(parent)?.type === 'COMPONENT_SET';
    const target = pageAncestor(doc, node.id) ?? parent;
    return (
      <div className="border-b p-2 border-app" data-testid="component-section">
        {inSet && (
          <div className="mb-1.5 text-xs text-secondary-app" data-testid="component-variant-props">
            {Object.entries(variantPropsOf(node))
              .map(([k, v]) => `${k}=${v}`)
              .join(', ')}
          </div>
        )}
        <button
          type="button"
          data-testid="create-instance-button"
          disabled={!target}
          className="w-full rounded py-1 text-xs bg-hover-app disabled:opacity-40"
          onClick={() => {
            if (!target) return;
            const instId = doc.createInstance(node.id, target, {
              x: node.x + INSTANCE_OFFSET,
              y: node.y + INSTANCE_OFFSET,
            });
            doc.commitUndoGroup();
            setSelection([instId]);
          }}
        >
          Create instance
        </button>
      </div>
    );
  }

  if (node.type === 'INSTANCE') {
    return <InstanceInspector doc={doc} instanceId={node.id} componentId={node.componentId} />;
  }

  return null;
}

function InstanceInspector({
  doc,
  instanceId,
  componentId,
}: {
  doc: OpenDoc;
  instanceId: string;
  componentId: string;
}) {
  const source = doc.getNode(componentId);
  const setId = source ? doc.getParentId(componentId) : undefined;
  const set = setId ? doc.getNode(setId) : undefined;
  const inSet = set?.type === 'COMPONENT_SET';

  const matrix = inSet ? variantMatrixOf(doc, setId!) : {};
  const current = source?.type === 'COMPONENT' ? variantPropsOf(source) : {};

  const swap = (prop: string, value: string) => {
    const nextProps = { ...current, [prop]: value };
    const match = findVariant(doc, setId!, nextProps);
    if (!match) return;
    doc.updateNode(instanceId, { componentId: match });
    doc.commitUndoGroup();
  };

  return (
    <div className="border-b p-2 border-app" data-testid="component-section">
      <span className="text-xs text-secondary-app">Instance of</span>
      <div className="mb-1 text-xs font-medium" data-testid="instance-source-name">
        {inSet ? (set?.name ?? setId) : (source?.name ?? componentId)}
      </div>

      {inSet &&
        Object.entries(matrix).map(([prop, values]) => (
          <label key={prop} className="mb-1.5 flex items-center justify-between gap-2 text-xs">
            <span className="text-secondary-app">{prop}</span>
            <select
              data-testid={`variant-select-${prop}`}
              className="flex-1 rounded border px-1 py-0.5 bg-hover-app border-app"
              value={current[prop] ?? ''}
              onChange={(e) => swap(prop, e.target.value)}
            >
              {values.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
        ))}
    </div>
  );
}
