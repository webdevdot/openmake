import { useEffect } from 'react';
import { computeLayout } from '@openmake/layout';
import type { OpenDoc } from '@openmake/core';
import { applyLayoutPatches } from '../lib/apply-layout-patches.js';
import { useDocVersion } from './document.js';

/**
 * After any change to the document, re-runs computeLayout from every
 * auto-layout frame reachable from the page and writes back any patches.
 * The no-op guard in applyLayoutPatches stops this from looping.
 */
export function useAutoLayout(doc: OpenDoc | null | undefined, pageId: string | null): void {
  const version = useDocVersion(doc);

  useEffect(() => {
    if (!doc || !pageId) return;
    const visit = (id: string) => {
      const node = doc.getNode(id);
      if (!node) return;
      if ('autoLayout' in node && node.autoLayout) {
        const patches = computeLayout(doc, id);
        applyLayoutPatches(doc, patches);
      }
      for (const childId of doc.getChildrenIds(id)) visit(childId);
    };
    for (const childId of doc.getChildrenIds(pageId)) visit(childId);
    // `version` is the effect trigger (re-run after every doc mutation); doc/pageId are stable identities.
  }, [doc, pageId, version]);
}
