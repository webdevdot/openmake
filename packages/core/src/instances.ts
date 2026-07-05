import { SceneNodeSchema, type InstanceNode, type SceneNode } from '@openmake/shared';
import type { OpenDoc } from './doc.js';

export interface ResolvedInstance {
  rootId: string;
  /** Synthetic ids: `<instanceId>:<sourceNodeId>`. */
  nodes: Record<string, SceneNode>;
}

/**
 * Expand an INSTANCE into a renderable subtree: clones the component's nodes
 * under synthetic ids, applies the instance's per-node overrides, and places
 * the root at the instance's own geometry.
 */
export function resolveInstance(doc: OpenDoc, instanceId: string): ResolvedInstance {
  const instance = doc.getNode(instanceId) as InstanceNode | undefined;
  if (instance?.type !== 'INSTANCE') {
    throw new Error(`Node "${instanceId}" is not an instance`);
  }
  const component = doc.getNode(instance.componentId);
  if (!component || (component.type !== 'COMPONENT' && component.type !== 'COMPONENT_SET')) {
    throw new Error(`Instance "${instanceId}" references missing component "${instance.componentId}"`);
  }

  const nodes: Record<string, SceneNode> = {};
  const syntheticId = (sourceId: string) => `${instanceId}:${sourceId}`;

  const cloneSubtree = (sourceId: string): string => {
    const source = doc.getNode(sourceId);
    if (!source) throw new Error(`Component subtree node "${sourceId}" is missing`);
    const cloneId = syntheticId(sourceId);
    const overrides = instance.overrides[sourceId] ?? {};
    const childIds = doc.getChildrenIds(sourceId).map(cloneSubtree);
    const isRoot = sourceId === instance.componentId;
    const raw: Record<string, unknown> = {
      ...(source as unknown as Record<string, unknown>),
      ...overrides,
      id: cloneId,
      children: childIds,
      ...(isRoot
        ? {
            // The resolved root renders as a plain frame placed like the instance.
            type: 'FRAME',
            name: instance.name,
            x: instance.x,
            y: instance.y,
            width: instance.width,
            height: instance.height,
            rotation: instance.rotation,
          }
        : {}),
    };
    nodes[cloneId] = SceneNodeSchema.parse(raw);
    return cloneId;
  };

  const rootId = cloneSubtree(instance.componentId);
  return { rootId, nodes };
}
