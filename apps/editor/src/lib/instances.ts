import type { OpenDoc } from '@openmake/core';

/** Offset (px) applied to a new instance so it doesn't sit exactly on its source. */
export const INSTANCE_OFFSET = 40;

/**
 * Walk up to the nearest PAGE ancestor of `id` so instances land on the canvas,
 * not nested inside a COMPONENT_SET (or any other container). Returns undefined
 * for nodes not descended from a page (e.g. the document root itself).
 */
export function pageAncestor(doc: OpenDoc, id: string): string | undefined {
  for (let cur: string | undefined = id; cur; cur = doc.getParentId(cur)) {
    const parentId = doc.getParentId(cur);
    if (!parentId) return undefined;
    if (doc.getNode(parentId)?.type === 'PAGE') return parentId;
  }
  return undefined;
}

/**
 * Insert an INSTANCE of `componentId` into `parentId` at `position`, commit it
 * as one undo group, and return the new instance's id. Shared by the inspector's
 * "Create instance" button and the Assets panel's component browser so both
 * paths route through the same `doc.createInstance` semantics.
 */
export function insertInstance(
  doc: OpenDoc,
  componentId: string,
  parentId: string,
  position: { x: number; y: number },
): string {
  const instId = doc.createInstance(componentId, parentId, position);
  doc.commitUndoGroup();
  return instId;
}
