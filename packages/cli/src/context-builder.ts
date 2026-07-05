import type { DesignContext, SceneNode, SelectedNodeContext, Variable } from '@openmake/shared';
import type { OpenDoc } from '@openmake/core';

/**
 * Minimal, local DesignContext builder for the CLI's `codegen` command.
 * Deliberately does not depend on `@openmake/ai` — it only needs the
 * selected node's subtree and referenced variables, which core alone provides.
 */
export function buildDesignContext(doc: OpenDoc, nodeId: string): DesignContext {
  const node = doc.getNode(nodeId);
  if (!node) throw new Error(`Node "${nodeId}" does not exist in the document`);

  const descendants: Record<string, SceneNode> = {};
  const childrenOrder: Record<string, string[]> = {};

  const collect = (id: string) => {
    const childIds = doc.getChildrenIds(id);
    if ('children' in (doc.getNode(id) ?? {})) childrenOrder[id] = childIds;
    for (const childId of childIds) {
      const child = doc.getNode(childId);
      if (!child) continue;
      descendants[childId] = child;
      collect(childId);
    }
  };
  collect(nodeId);

  const path: Array<{ id: string; name: string; type: SceneNode['type'] }> = [];
  let ancestorId = doc.getParentId(nodeId);
  const chain: Array<{ id: string; name: string; type: SceneNode['type'] }> = [];
  while (ancestorId) {
    const ancestor = doc.getNode(ancestorId);
    if (!ancestor) break;
    chain.unshift({ id: ancestor.id, name: ancestor.name, type: ancestor.type });
    ancestorId = doc.getParentId(ancestorId);
  }
  path.push(...chain);

  const referencedVariableIds = new Set<string>();
  const collectBoundVariables = (n: SceneNode) => {
    if (n.boundVariables) {
      for (const varId of Object.values(n.boundVariables)) referencedVariableIds.add(varId);
    }
  };
  collectBoundVariables(node);
  for (const d of Object.values(descendants)) collectBoundVariables(d);

  const allVariables = doc.getVariables();
  const variables: Record<string, Variable> = {};
  for (const id of referencedVariableIds) {
    const v = allVariables[id];
    if (v) variables[id] = v;
  }

  const selected: SelectedNodeContext = {
    node,
    path,
    descendants,
    childrenOrder,
    ...(node.type === 'COMPONENT' || node.type === 'INSTANCE'
      ? {
          component: {
            id: node.type === 'INSTANCE' ? node.componentId : node.id,
            name: node.name,
            description: node.type === 'COMPONENT' ? node.description : '',
            ...(node.type === 'COMPONENT' && node.variantProperties
              ? { variantProperties: node.variantProperties }
              : {}),
          },
        }
      : {}),
  };

  return {
    document: { id: doc.id, name: doc.name },
    selection: [selected],
    variables,
    styles: doc.getStyles(),
  };
}
