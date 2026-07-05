import type { DesignContext, SceneNode, SelectedNodeContext } from '@openmake/shared';

/**
 * Resolves a selected node's subtree (self + descendants + children order) into a
 * lookup shared by every generator, so each only needs to walk `roots`.
 */
export interface ResolvedTree {
  root: SceneNode;
  getNode(id: string): SceneNode | undefined;
  getChildren(id: string): SceneNode[];
}

export function resolveTree(selected: SelectedNodeContext): ResolvedTree {
  const byId = new Map<string, SceneNode>();
  byId.set(selected.node.id, selected.node);
  for (const [id, node] of Object.entries(selected.descendants)) byId.set(id, node);

  const getNode = (id: string): SceneNode | undefined => byId.get(id);
  const getChildren = (id: string): SceneNode[] => {
    const order = selected.childrenOrder[id] ?? [];
    return order.map((childId) => byId.get(childId)).filter((n): n is SceneNode => n !== undefined);
  };

  return { root: selected.node, getNode, getChildren };
}

/** Every selection entry in a {@link DesignContext}, each resolved to its own subtree. */
export function resolveAllTrees(ctx: DesignContext): ResolvedTree[] {
  return ctx.selection.map(resolveTree);
}

export function isContainerNode(
  node: SceneNode,
): node is Extract<SceneNode, { children: string[] }> {
  return 'children' in node;
}
