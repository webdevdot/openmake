import type { OpenDoc } from '@openmake/core';
import { resolveInstance } from '@openmake/core';
import type { DesignContext, SelectedNodeContext } from '@openmake/shared';
import type { NodeType, SceneNode } from '@openmake/shared';

export interface BuildContextOptions {
  /** Maximum descendant depth expanded below each selected node. */
  maxDepth?: number;
}

const DEFAULT_MAX_DEPTH = 10;

/** Node fields that hold a style id reference, by convention `<kind>StyleId`. */
const STYLE_ID_KEYS = ['fillStyleId', 'strokeStyleId', 'textStyleId', 'effectStyleId'] as const;

/** `children` only exists on container node variants of the SceneNode union. */
function getChildren(node: SceneNode): string[] {
  const children = (node as { children?: string[] }).children;
  return children ?? [];
}

/**
 * Context Builder Engine: turns a raw selection into the structured
 * DesignContext handed to AI (path, subtree, referenced variables/styles,
 * component info), expanding instances into their resolved subtrees.
 */
export function buildDesignContext(
  doc: OpenDoc,
  nodeIds: string[],
  opts: BuildContextOptions = {},
): DesignContext {
  const maxDepth = opts.maxDepth ?? DEFAULT_MAX_DEPTH;
  const variableIds = new Set<string>();
  const styleIds = new Set<string>();

  const selection = nodeIds.map((id) =>
    buildSelectedNodeContext(doc, id, maxDepth, variableIds, styleIds),
  );

  const allVariables = doc.getVariables();
  const allStyles = doc.getStyles();

  return {
    document: { id: doc.id, name: doc.name },
    selection,
    variables: pick(allVariables, variableIds),
    styles: pick(allStyles, styleIds),
  };
}

function buildSelectedNodeContext(
  doc: OpenDoc,
  nodeId: string,
  maxDepth: number,
  variableIds: Set<string>,
  styleIds: Set<string>,
): SelectedNodeContext {
  const node = doc.getNode(nodeId);
  if (!node) throw new Error(`Node "${nodeId}" does not exist`);

  const path = buildAncestorPath(doc, nodeId);
  collectRefs(node, variableIds, styleIds);

  const descendants: Record<string, SceneNode> = {};
  const childrenOrder: Record<string, string[]> = {};

  if (node.type === 'INSTANCE') {
    const resolved = resolveInstance(doc, nodeId);
    const rootNode = resolved.nodes[resolved.rootId];
    if (rootNode) {
      collectRefs(rootNode, variableIds, styleIds);
      childrenOrder[nodeId] = getChildren(rootNode);
      walkResolvedInstance(resolved, resolved.rootId, 1, maxDepth, descendants, childrenOrder, variableIds, styleIds);
    }
  } else {
    walkChildren(doc, nodeId, 1, maxDepth, descendants, childrenOrder, variableIds, styleIds);
  }

  return {
    node,
    path,
    descendants,
    childrenOrder,
    component: buildComponentInfo(doc, node),
  };
}

function buildAncestorPath(
  doc: OpenDoc,
  nodeId: string,
): Array<{ id: string; name: string; type: NodeType }> {
  const chain: Array<{ id: string; name: string; type: NodeType }> = [];
  let parentId = doc.getParentId(nodeId);
  while (parentId) {
    const parent = doc.getNode(parentId);
    if (!parent) break;
    chain.push({ id: parent.id, name: parent.name, type: parent.type });
    parentId = doc.getParentId(parentId);
  }
  return chain.reverse();
}

function walkChildren(
  doc: OpenDoc,
  parentId: string,
  depth: number,
  maxDepth: number,
  descendants: Record<string, SceneNode>,
  childrenOrder: Record<string, string[]>,
  variableIds: Set<string>,
  styleIds: Set<string>,
): void {
  const childIds = doc.getChildrenIds(parentId);
  childrenOrder[parentId] = childIds;
  if (depth > maxDepth) return;

  for (const childId of childIds) {
    const child = doc.getNode(childId);
    if (!child) continue;
    descendants[childId] = child;
    collectRefs(child, variableIds, styleIds);

    if (child.type === 'INSTANCE') {
      const resolved = resolveInstance(doc, childId);
      const rootNode = resolved.nodes[resolved.rootId];
      if (rootNode) {
        collectRefs(rootNode, variableIds, styleIds);
        childrenOrder[childId] = getChildren(rootNode);
        walkResolvedInstance(
          resolved,
          resolved.rootId,
          depth + 1,
          maxDepth,
          descendants,
          childrenOrder,
          variableIds,
          styleIds,
        );
      }
    } else if (depth < maxDepth) {
      walkChildren(doc, childId, depth + 1, maxDepth, descendants, childrenOrder, variableIds, styleIds);
    } else {
      childrenOrder[childId] = [];
    }
  }
}

function walkResolvedInstance(
  resolved: { rootId: string; nodes: Record<string, SceneNode> },
  parentSyntheticId: string,
  depth: number,
  maxDepth: number,
  descendants: Record<string, SceneNode>,
  childrenOrder: Record<string, string[]>,
  variableIds: Set<string>,
  styleIds: Set<string>,
): void {
  const parentNode = resolved.nodes[parentSyntheticId];
  const childIds = parentNode ? getChildren(parentNode) : [];

  for (const childId of childIds) {
    if (depth > maxDepth) break;
    const child = resolved.nodes[childId];
    if (!child) continue;
    descendants[childId] = child;
    collectRefs(child, variableIds, styleIds);
    childrenOrder[childId] = getChildren(child);
    if (depth < maxDepth) {
      walkResolvedInstance(
        resolved,
        childId,
        depth + 1,
        maxDepth,
        descendants,
        childrenOrder,
        variableIds,
        styleIds,
      );
    }
  }
}

function collectRefs(node: SceneNode, variableIds: Set<string>, styleIds: Set<string>): void {
  const boundVariables = (node as { boundVariables?: Record<string, string> }).boundVariables;
  if (boundVariables) {
    for (const variableId of Object.values(boundVariables)) variableIds.add(variableId);
  }

  const raw = node as unknown as Record<string, unknown>;
  for (const key of STYLE_ID_KEYS) {
    const value = raw[key];
    if (typeof value === 'string') styleIds.add(value);
  }
}

function buildComponentInfo(
  doc: OpenDoc,
  node: SceneNode,
): SelectedNodeContext['component'] {
  if (node.type === 'COMPONENT') {
    return {
      id: node.id,
      name: node.name,
      description: node.description,
      variantProperties: node.variantProperties,
    };
  }
  if (node.type === 'INSTANCE') {
    const component = doc.getNode(node.componentId);
    if (component && component.type === 'COMPONENT') {
      return {
        id: component.id,
        name: component.name,
        description: component.description,
        variantProperties: component.variantProperties,
      };
    }
  }
  return undefined;
}

function pick<T>(source: Record<string, T>, ids: Set<string>): Record<string, T> {
  const result: Record<string, T> = {};
  for (const id of ids) {
    const value = source[id];
    if (value !== undefined) result[id] = value;
  }
  return result;
}
