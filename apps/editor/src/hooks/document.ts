import { useCallback, useSyncExternalStore } from 'react';
import type { OpenDoc } from '@openmake/core';
import type { SceneNode } from '@openmake/shared';

const noopSubscribe = () => () => {};

/**
 * Re-renders whenever the document version changes (any mutation, anywhere).
 * Null-tolerant: pages render hooks before the collab session has produced a
 * doc, so `null` simply means "no store yet" (version -1, no subscription).
 */
export function useDocVersion(doc: OpenDoc | null | undefined): number {
  const subscribe = useCallback(
    (onChange: () => void) => (doc ? doc.subscribe(onChange) : noopSubscribe()),
    [doc],
  );
  const getSnapshot = useCallback(() => (doc ? doc.version : -1), [doc]);
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
