import type { OpenDoc } from '@openmake/core';
import type { Reaction, SceneNode } from '@openmake/shared';

export interface InteractionSectionProps {
  doc: OpenDoc;
  node: SceneNode;
  pageId: string;
}

const NEW_REACTION: Reaction = {
  trigger: 'ON_CLICK',
  action: { type: 'NAVIGATE', transition: { type: 'INSTANT', durationMs: 300 } },
};

export function InteractionSection({ doc, node, pageId }: InteractionSectionProps) {
  const reactions = node.reactions ?? [];
  const frameIds = doc.getChildrenIds(pageId).filter((id) => {
    const n = doc.getNode(id);
    return n?.type === 'FRAME' && id !== node.id;
  });

  const commit = (next: Reaction[]) => {
    doc.updateNode(node.id, { reactions: next });
    doc.commitUndoGroup();
  };

  return (
    <div className="border-b p-2 border-app" data-testid="interaction-section">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-medium text-secondary-app">Interaction</span>
        <button
          type="button"
          data-testid="add-interaction-button"
          className="rounded px-1 text-xs bg-hover-app"
          onClick={() => commit([...reactions, NEW_REACTION])}
        >
          +
        </button>
      </div>
      {reactions.map((reaction, index) => (
        <div key={index} className="flex items-center gap-1 py-0.5 text-xs">
          <span className="text-secondary-app">On click →</span>
          <select
            data-testid="interaction-destination-select"
            className="flex-1 rounded border bg-transparent px-1 py-0.5 border-app"
            value={reaction.action.destinationId ?? ''}
            onChange={(e) => {
              const next = [...reactions];
              next[index] = { ...reaction, action: { ...reaction.action, type: 'NAVIGATE', destinationId: e.target.value } };
              commit(next);
            }}
          >
            <option value="">Select frame…</option>
            {frameIds.map((id) => (
              <option key={id} value={id}>
                {doc.getNode(id)?.name}
              </option>
            ))}
          </select>
          <button type="button" onClick={() => commit(reactions.filter((_, i) => i !== index))}>
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
