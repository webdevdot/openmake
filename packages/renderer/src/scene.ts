import type { Color, Paint, SceneNode, TrackProperty } from '@openmake/shared';
import { resolveInstance, type OpenDoc } from '@openmake/core';

/**
 * Resolved COLOR-variable values for the active mode, keyed by variableId →
 * hex string (e.g. "#3355ff"). Variables v1 binds only solid color fills, so
 * only COLOR variables need to reach the scene. The editor computes this map
 * from the doc's variables and its per-collection active-mode view state, and
 * threads it in the same way image bytes / animation overrides are threaded.
 * A bound fill whose variable is absent here falls back to its stored color.
 */
export type VariableColors = Record<string, string>;

/** #rgb / #rrggbb / #rrggbbaa → Color (0–1). Returns null on malformed input. */
function hexToColor(hex: string): Color | null {
  const clean = hex.trim().replace(/^#/, '');
  const expand = (s: string) =>
    s.length === 3 || s.length === 4
      ? s
          .split('')
          .map((c) => c + c)
          .join('')
      : s;
  const c = expand(clean);
  if (c.length !== 6 && c.length !== 8) return null;
  const n = (i: number) => parseInt(c.slice(i, i + 2), 16);
  const r = n(0);
  const g = n(2);
  const b = n(4);
  const a = c.length === 8 ? n(6) : 255;
  if ([r, g, b, a].some(Number.isNaN)) return null;
  return { r: r / 255, g: g / 255, b: b / 255, a: a / 255 };
}

/**
 * Resolve variable-bound solid fills on a node into concrete colors for the
 * active mode. A SOLID paint with `boundVariableId` present in `variableColors`
 * is rewritten to that color (alpha preserved from the stored fallback color);
 * anything unresolved keeps its stored color. Returns the node unchanged when
 * it has no fills or no bound fills.
 */
function resolveNodeFills(node: SceneNode, variableColors: VariableColors): SceneNode {
  if (!('fills' in node)) return node;
  const fills = (node as { fills: Paint[] }).fills;
  let changed = false;
  const resolved = fills.map((fill) => {
    if (fill.type !== 'SOLID' || !fill.boundVariableId) return fill;
    const hex = variableColors[fill.boundVariableId];
    if (hex === undefined) return fill;
    const color = hexToColor(hex);
    if (!color) return fill;
    changed = true;
    return { ...fill, color: { ...color, a: fill.color.a } };
  });
  if (!changed) return node;
  return { ...node, fills: resolved } as SceneNode;
}

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
  variableColors: VariableColors = {},
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

  const bindFills = (node: SceneNode): SceneNode => resolveNodeFills(node, variableColors);

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
        nodes[cloneId] = bindFills(cloneNode);
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
        nodes[resolved.rootId] = bindFills({
          ...rootNode,
          ...rootPatch,
          children: visibleChildren,
          visible: true,
        } as SceneNode);
      }
      return resolved.rootId;
    }

    nodes[id] = bindFills(node);
    if ('children' in node) {
      const childIds = doc.getChildrenIds(id);
      const visibleChildIds: string[] = [];
      for (const childId of childIds) {
        const resultId = visit(childId);
        if (resultId) visibleChildIds.push(resultId);
      }
      nodes[id] = bindFills({ ...node, children: visibleChildIds } as SceneNode);
    }
    return id;
  };

  for (const childId of doc.getChildrenIds(pageId)) {
    const resultId = visit(childId);
    if (resultId) rootIds.push(resultId);
  }

  return { nodes, rootIds, images, backgroundColor: page.backgroundColor };
}
