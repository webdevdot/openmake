import {
  AlignStartVertical,
  AlignCenterVertical,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignCenterHorizontal,
  AlignEndHorizontal,
  AlignHorizontalDistributeCenter,
  AlignVerticalDistributeCenter,
  FlipHorizontal,
  FlipVertical,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { OpenDoc } from '@openmake/core';
import { alignNodes, distributeNodes, flipNode, type AlignEdge, type FlipAxis } from '@openmake/core';

export interface AlignSectionProps {
  doc: OpenDoc;
  /** The current selection (all selected node ids, selection order). */
  selectedIds: string[];
}

const ALIGN_BUTTONS: Array<{ edge: AlignEdge; label: string; icon: LucideIcon }> = [
  { edge: 'left', label: 'Align left', icon: AlignStartVertical },
  { edge: 'centerX', label: 'Align horizontal centers', icon: AlignCenterVertical },
  { edge: 'right', label: 'Align right', icon: AlignEndVertical },
  { edge: 'top', label: 'Align top', icon: AlignStartHorizontal },
  { edge: 'centerY', label: 'Align vertical centers', icon: AlignCenterHorizontal },
  { edge: 'bottom', label: 'Align bottom', icon: AlignEndHorizontal },
];

const iconBtn =
  'flex h-7 w-7 items-center justify-center rounded border bg-hover-app border-app ' +
  'disabled:opacity-40 disabled:cursor-default';

/**
 * Alignment / distribution / flip controls, shown at the top of the inspector
 * whenever a non-empty selection exists. Each action runs as a single undo step
 * (the core helpers wrap their writes in one transaction; we close the capture
 * group after). Distribute needs >= 3 nodes; flip acts on the primary node.
 */
export function AlignSection({ doc, selectedIds }: AlignSectionProps) {
  const canDistribute = selectedIds.length >= 3;
  const primaryId = selectedIds[0];

  const align = (edge: AlignEdge) => {
    alignNodes(doc, selectedIds, edge);
    doc.commitUndoGroup();
  };

  const distribute = (axis: 'x' | 'y') => {
    distributeNodes(doc, selectedIds, axis);
    doc.commitUndoGroup();
  };

  const flip = (axis: FlipAxis) => {
    if (!primaryId) return;
    flipNode(doc, primaryId, axis);
    doc.commitUndoGroup();
  };

  return (
    <div className="flex flex-col gap-1.5 border-b p-2 border-app" data-testid="align-section">
      <div className="flex items-center gap-1">
        {ALIGN_BUTTONS.map(({ edge, label, icon: Icon }) => (
          <button
            key={edge}
            type="button"
            aria-label={label}
            title={label}
            data-testid={`align-${edge}`}
            className={iconBtn}
            onClick={() => align(edge)}
          >
            <Icon size={15} strokeWidth={1.75} />
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label="Distribute horizontally"
          title="Distribute horizontally"
          data-testid="distribute-x"
          className={iconBtn}
          disabled={!canDistribute}
          onClick={() => distribute('x')}
        >
          <AlignHorizontalDistributeCenter size={15} strokeWidth={1.75} />
        </button>
        <button
          type="button"
          aria-label="Distribute vertically"
          title="Distribute vertically"
          data-testid="distribute-y"
          className={iconBtn}
          disabled={!canDistribute}
          onClick={() => distribute('y')}
        >
          <AlignVerticalDistributeCenter size={15} strokeWidth={1.75} />
        </button>

        <div className="mx-0.5 h-4 w-px bg-app" />

        <button
          type="button"
          aria-label="Flip horizontal"
          title="Flip horizontal"
          data-testid="flip-x"
          className={iconBtn}
          disabled={!primaryId}
          onClick={() => flip('x')}
        >
          <FlipHorizontal size={15} strokeWidth={1.75} />
        </button>
        <button
          type="button"
          aria-label="Flip vertical"
          title="Flip vertical"
          data-testid="flip-y"
          className={iconBtn}
          disabled={!primaryId}
          onClick={() => flip('y')}
        >
          <FlipVertical size={15} strokeWidth={1.75} />
        </button>
      </div>
    </div>
  );
}
