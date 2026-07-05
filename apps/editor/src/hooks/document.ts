import { useCallback, useSyncExternalStore } from 'react';
import type { OpenDoc } from '@openmake/core';
import type { SceneNode } from '@openmake/shared';

/** Re-renders whenever the document version changes (any mutation, anywhere). */
export function useDocVersion(doc: OpenDoc): number {
  const subscribe = useCallback((onChange: () => void) => doc.subscribe(onChange), [doc]);
  const getSnapshot = useCallback(() => doc.version, [doc]);
  return useSyncExternalStore(subscribe, getSnapshot);
}

/** Live snapshot of a single node; re-renders only cause a re-read, React does the diffing. */
export function useNode(doc: OpenDoc, id: string | null | undefined): SceneNode | undefined {
  useDocVersion(doc);
  return id ? doc.getNode(id) : undefined;
}

/** Live list of a node's children ids. */
export function useChildren(doc: OpenDoc, id: string | null | undefined): string[] {
  useDocVersion(doc);
  return id ? doc.getChildrenIds(id) : [];
}
