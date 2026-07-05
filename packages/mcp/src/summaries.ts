import type { OpenDoc } from '@openmake/core';
import type { SceneNode } from '@openmake/shared';

export interface NodeSummary {
  id: string;
  name: string;
  type: SceneNode['type'];
  childCount: number;
}

export interface PageSummary extends NodeSummary {
  children: NodeSummary[];
}

export interface DocumentSummary {
  id: string;
  name: string;
  rootId: string;
  pages: PageSummary[];
}

function summarizeNode(doc: OpenDoc, id: string): NodeSummary | null {
  const node = doc.getNode(id);
  if (!node) return null;
  return {
    id: node.id,
    name: node.name,
    type: node.type,
    childCount: doc.getChildrenIds(id).length,
  };
}

/** Page-tree summary of a document: id/name/type/counts only, never the full node dump. */
export function summarizeDocument(doc: OpenDoc): DocumentSummary {
  const pages: PageSummary[] = [];
  for (const pageId of doc.getPages()) {
    const pageNode = doc.getNode(pageId);
    if (!pageNode) continue;
    const children = doc
      .getChildrenIds(pageId)
      .map((childId) => summarizeNode(doc, childId))
      .filter((child): child is NodeSummary => child !== null);
    pages.push({
      id: pageNode.id,
      name: pageNode.name,
      type: pageNode.type,
      childCount: children.length,
      children,
    });
  }
  return { id: doc.id, name: doc.name, rootId: doc.rootId, pages };
}

export interface NodeWithChildren {
  node: SceneNode;
  children: NodeWithChildren[];
}

/** Node plus its descendants down to `depth` levels (1 = direct children only). */
export function readNodeToDepth(doc: OpenDoc, nodeId: string, depth: number): NodeWithChildren {
  const node = doc.getNode(nodeId);
  if (!node) throw new Error(`Node "${nodeId}" does not exist`);
  const children =
    depth <= 0
      ? []
      : doc
          .getChildrenIds(nodeId)
          .map((childId) => readNodeToDepth(doc, childId, depth - 1));
  return { node, children };
}
