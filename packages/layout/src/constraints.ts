import type { SceneNode } from '@openmake/shared';
import type { LayoutPatch } from './types.js';

interface ParentSize {
  width: number;
  height: number;
}

/**
 * Recompute a non-auto-layout child's geometry after its parent frame
 * resizes, per the child's Constraints (MIN/MAX/CENTER/STRETCH/SCALE on each
 * axis independently). Figma-like semantics:
 *  - MIN: keep offset from the left/top edge fixed.
 *  - MAX: keep offset from the right/bottom edge fixed.
 *  - CENTER: keep the offset of the child's center from the parent's center fixed.
 *  - STRETCH: pin both edges — offset from both near and far edge stays fixed,
 *    so the child resizes by the same delta as the parent.
 *  - SCALE: position and size scale proportionally with the parent's size.
 */
export function applyConstraints(
  child: SceneNode,
  oldParent: ParentSize,
  newParent: ParentSize,
): LayoutPatch {
  const constraints = child.constraints ?? { horizontal: 'MIN', vertical: 'MIN' };
  const patch: LayoutPatch = {};

  const horizontal = solveAxis(
    constraints.horizontal,
    child.x,
    child.width,
    oldParent.width,
    newParent.width,
  );
  patch.x = horizontal.position;
  if (horizontal.size !== undefined) patch.width = horizontal.size;

  const vertical = solveAxis(
    constraints.vertical,
    child.y,
    child.height,
    oldParent.height,
    newParent.height,
  );
  patch.y = vertical.position;
  if (vertical.size !== undefined) patch.height = vertical.size;

  return patch;
}

function solveAxis(
  mode: 'MIN' | 'MAX' | 'CENTER' | 'STRETCH' | 'SCALE',
  position: number,
  size: number,
  oldParentSize: number,
  newParentSize: number,
): { position: number; size?: number } {
  switch (mode) {
    case 'MIN':
      return { position };
    case 'MAX': {
      const offsetFromFar = oldParentSize - (position + size);
      return { position: newParentSize - offsetFromFar - size };
    }
    case 'CENTER': {
      const centerOffset = position + size / 2 - oldParentSize / 2;
      return { position: newParentSize / 2 + centerOffset - size / 2 };
    }
    case 'STRETCH': {
      const offsetFromFar = oldParentSize - (position + size);
      const newSize = newParentSize - position - offsetFromFar;
      return { position, size: Math.max(0, newSize) };
    }
    case 'SCALE': {
      const scale = oldParentSize === 0 ? 1 : newParentSize / oldParentSize;
      return { position: position * scale, size: size * scale };
    }
  }
}
