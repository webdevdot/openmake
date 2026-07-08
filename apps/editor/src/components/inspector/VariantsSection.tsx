import type { OpenDoc } from '@openmake/core';
import { useSelectionStore } from '../../store/selection.js';

export interface VariantsSectionProps {
  doc: OpenDoc;
  /** The current selection (all selected node ids, selection order). */
  selectedIds: string[];
}

/**
 * Multi-select action to combine >= 2 COMPONENT nodes into a COMPONENT_SET.
 * Rendered only when every selected node is a component sharing one parent
 * (Figma's requirement for "Combine as variants"). Runs as one undo step.
 */
export function VariantsSection({ doc, selectedIds }: VariantsSectionProps) {
  const setSelection = useSelectionStore((s) => s.set);

  const nodes = selectedIds.map((id) => doc.getNode(id));
  const allComponents =
    selectedIds.length >= 2 && nodes.every((n) => n?.type === 'COMPONENT');
  const firstParent = selectedIds[0] ? doc.getParentId(selectedIds[0]) : undefined;
  const sharedParent =
    firstParent !== undefined &&
    selectedIds.every((id) => doc.getParentId(id) === firstParent);

  if (!allComponents || !sharedParent) return null;

  return (
    <div className="border-b p-2 border-app" data-testid="variants-section">
      <button
        type="button"
        data-testid="combine-variants-button"
        className="w-full rounded py-1 text-xs bg-hover-app"
        onClick={() => {
          const setId = doc.combineAsVariants(selectedIds);
          doc.commitUndoGroup();
          setSelection([setId]);
        }}
      >
        Combine as variants
      </button>
    </div>
  );
}
