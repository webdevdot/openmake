import type { Color, SceneNode } from '@openmake/shared';
import { resolveInstance, type OpenDoc } from '@openmake/core';

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export interface RenderScene {
  nodes: Record<string, SceneNode>;
  /** page children ids, bottom→top z-order */
  rootIds: string[];
  /** assetId → decoded image bytes (png/jpg) for IMAGE paints */
  images?: Record<string, Uint8Array>;
  backgroundColor?: Color;
}

/**
 * Build a RenderScene from a live document page: expands INSTANCE nodes via
 * resolveInstance, skips invisible nodes (and their subtrees).
 *
 * `images` maps assetId → decoded bytes for IMAGE paints. AssetRef in the doc
 * stores only a content hash, so the actual pixels are supplied by the caller
 * (the editor holds a client-side bytes cache keyed by assetId).
 */
export function buildRenderScene(
  doc: OpenDoc,
  pageId: string,
  images?: Record<string, Uint8Array>,
): RenderScene {
  const page = doc.getNode(pageId);
  if (!page || page.type !== 'PAGE') {
    throw new Error(`Node "${pageId}" is not a page`);
  }

  const nodes: Record<string, SceneNode> = {};
  const rootIds: string[] = [];

  const visit = (id: string): string | null => {
    const node = doc.getNode(id);
    if (!node || !node.visible) return null;

    if (node.type === 'INSTANCE') {
      const resolved = resolveInstance(doc, id);
      for (const [cloneId, cloneNode] of Object.entries(resolved.nodes)) {
        // The resolved root stands in for the (already visibility-checked) instance
        // itself, so its own visible flag is ignored — only the component master's
        // visibility state would otherwise leak in, which isn't meaningful per-instance.
        if (cloneId !== resolved.rootId && !cloneNode.visible) continue;
        nodes[cloneId] = cloneNode;
      }
      // Recurse into the resolved children so nested invisible nodes are pruned too.
      const rootNode = resolved.nodes[resolved.rootId];
      if (rootNode && 'children' in rootNode) {
        const visibleChildren = (rootNode.children as string[]).filter((childId) => {
          const child = resolved.nodes[childId];
          return child?.visible;
        });
        nodes[resolved.rootId] = {
          ...rootNode,
          children: visibleChildren,
          visible: true,
        } as SceneNode;
      }
      return resolved.rootId;
    }

    nodes[id] = node;
    if ('children' in node) {
      const childIds = doc.getChildrenIds(id);
      const visibleChildIds: string[] = [];
      for (const childId of childIds) {
        const resultId = visit(childId);
        if (resultId) visibleChildIds.push(resultId);
      }
      nodes[id] = { ...node, children: visibleChildIds } as SceneNode;
    }
    return id;
  };

  for (const childId of doc.getChildrenIds(pageId)) {
    const resultId = visit(childId);
    if (resultId) rootIds.push(resultId);
  }

  return { nodes, rootIds, images, backgroundColor: page.backgroundColor };
}
