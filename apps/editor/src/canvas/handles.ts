import type { Bounds } from '@openmake/core';

export type HandleId = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

export const HANDLE_IDS: HandleId[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

/** World-space position of each of the 8 resize handles around a bounds rect. */
export function handlePositions(bounds: Bounds): Record<HandleId, { x: number; y: number }> {
  const { x, y, width, height } = bounds;
  const midX = x + width / 2;
  const midY = y + height / 2;
  return {
    nw: { x, y },
    n: { x: midX, y },
    ne: { x: x + width, y },
    e: { x: x + width, y: midY },
    se: { x: x + width, y: y + height },
    s: { x: midX, y: y + height },
    sw: { x, y: y + height },
    w: { x, y: midY },
  };
}

/**
 * Resulting bounds when dragging a given handle by a world-space delta.
 * `aspectLock` preserves the original aspect ratio (shift-drag), anchored at
 * the opposite handle/edge.
 */
export function resizeBounds(
  original: Bounds,
  handle: HandleId,
  delta: { x: number; y: number },
  aspectLock: boolean,
): Bounds {
  let { x, y, width, height } = original;
  const right = original.x + original.width;
  const bottom = original.y + original.height;

  const affectsLeft = handle === 'nw' || handle === 'w' || handle === 'sw';
  const affectsRight = handle === 'ne' || handle === 'e' || handle === 'se';
  const affectsTop = handle === 'nw' || handle === 'n' || handle === 'ne';
  const affectsBottom = handle === 'sw' || handle === 's' || handle === 'se';

  if (affectsLeft) {
    x = original.x + delta.x;
    width = right - x;
  } else if (affectsRight) {
    width = original.width + delta.x;
  }

  if (affectsTop) {
    y = original.y + delta.y;
    height = bottom - y;
  } else if (affectsBottom) {
    height = original.height + delta.y;
  }

  if (aspectLock && original.width > 0 && original.height > 0) {
    const ratio = original.width / original.height;
    const isCorner = affectsLeft !== affectsRight && affectsTop !== affectsBottom;
    if (isCorner) {
      // Drive from whichever axis moved more, keep the opposite corner anchored.
      if (Math.abs(delta.x) > Math.abs(delta.y)) {
        height = width / ratio;
      } else {
        width = height * ratio;
      }
      if (affectsLeft) x = right - width;
      if (affectsTop) y = bottom - height;
    } else if (affectsLeft || affectsRight) {
      height = width / ratio;
      if (affectsTop) y = bottom - height;
    } else if (affectsTop || affectsBottom) {
      width = height * ratio;
      if (affectsLeft) x = right - width;
    }
  }

  if (width < 0) {
    x += width;
    width = -width;
  }
  if (height < 0) {
    y += height;
    height = -height;
  }

  return { x, y, width, height };
}
