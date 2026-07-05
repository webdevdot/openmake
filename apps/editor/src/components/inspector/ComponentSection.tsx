import type { OpenDoc } from '@openmake/core';
import type { SceneNode } from '@openmake/shared';

export interface ComponentSectionProps {
  doc: OpenDoc;
  node: SceneNode;
}

export function ComponentSection({ doc, node }: ComponentSectionProps) {
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

  if (node.type === 'INSTANCE') {
    const component = doc.getNode(node.componentId);
    return (
      <div className="border-b p-2 border-app" data-testid="component-section">
        <span className="text-xs text-secondary-app">Instance of</span>
        <div className="text-xs font-medium">{component?.name ?? node.componentId}</div>
      </div>
    );
  }

  return null;
}
