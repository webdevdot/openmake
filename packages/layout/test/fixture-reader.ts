import { SceneNodeSchema, type SceneNode } from '@openmake/shared';
import type { NodeReader } from '../src/index.js';

/** Build a NodeReader over a flat list of partial node specs, filling schema defaults. */
export function fixtureReader(nodes: Record<string, unknown>[]): NodeReader {
  const parsed = new Map<string, SceneNode>();
  for (const raw of nodes) {
    const node = SceneNodeSchema.parse({ name: (raw as { id: string }).id, ...raw });
    parsed.set(node.id, node);
  }
  return {
    getNode: (id) => parsed.get(id),
    getChildrenIds: (id) => {
      const node = parsed.get(id);
      return node && 'children' in node ? [...node.children] : [];
    },
  };
}
