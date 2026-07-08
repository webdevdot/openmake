import type { Color, SceneNode, TrackProperty } from '@openmake/shared';
import { resolveInstance, type OpenDoc } from '@openmake/core';

/**
 * Per-node property overrides applied on top of the persisted node, keyed by
 * node id. Used by motion playback to preview sampled animation values without
 * writing them into the doc. Only plain numeric transform/opacity properties
 * are overridable.
 */
export type SceneOverrides = Record<string, Partial<Record<TrackProperty, number>>>;

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
 *
 * `overrides` maps nodeId → sampled numeric props (motion playback). Each match
 * is merged on top of the persisted node for this frame only; the doc is never
 * mutated. An overridden node's `visible` flag still gates whether it renders.
 */
export function buildRenderScene(
  doc: OpenDoc,
  pageId: string,
  images?: Record<string, Uint8Array>,
  overrides: SceneOverrides = {},
): RenderScene {
  const page = doc.getNode(pageId);
  if (!page || page.type !== 'PAGE') {
    throw new Error(`Node "${pageId}" is not a page`);
  }

  const nodes: Record<string, SceneNode> = {};
  const rootIds: string[] = [];

  const applyOverride = (node: SceneNode): SceneNode => {
    const patch = overrides[node.id];
    if (!patch) return node;
    return { ...node, ...patch } as SceneNode;
  };

  const visit = (id: string): string | null => {
    const raw = doc.getNode(id);
    if (!raw || !raw.visible) return null;
    const node = applyOverride(raw);

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
        // Overrides are keyed by the instance's own id; the resolved root uses a
        // synthetic id, so patch it explicitly rather than via applyOverride.
        const rootPatch = overrides[id] ?? {};
        nodes[resolved.rootId] = {
          ...rootNode,
          ...rootPatch,
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
