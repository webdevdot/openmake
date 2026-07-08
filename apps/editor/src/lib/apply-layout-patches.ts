import type { OpenDoc } from '@openmake/core';
import type { LayoutPatch } from '@openmake/layout';

const EPSILON = 1e-6;

function patchIsNoop(current: Record<string, unknown>, patch: LayoutPatch): boolean {
  return (Object.keys(patch) as Array<keyof LayoutPatch>).every((key) => {
    const currentValue = current[key];
    const patchValue = patch[key];
    return typeof currentValue === 'number' && typeof patchValue === 'number'
      ? Math.abs(currentValue - patchValue) < EPSILON
      : currentValue === patchValue;
  });
}

/**
 * Applies computeLayout patches via updateNode inside one transaction,
 * skipping any patch that's identical to current geometry — this guard is
 * what prevents an infinite subscribe → recompute → write → subscribe loop.
 */
export function applyLayoutPatches(doc: OpenDoc, patches: Map<string, LayoutPatch>): void {
  const toApply: Array<[string, LayoutPatch]> = [];
  for (const [id, patch] of patches) {
    const node = doc.getNode(id);
    if (!node) continue;
    if (patchIsNoop(node as unknown as Record<string, unknown>, patch)) continue;
    toApply.push([id, patch]);
  }
  if (toApply.length === 0) return;
  doc.transact(() => {
    for (const [id, patch] of toApply)
      doc.updateNode(id, patch as unknown as Record<string, unknown>);
  });
}
