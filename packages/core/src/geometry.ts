import { CONTAINER_TYPES, type SceneNode, type Vec2 } from '@openmake/shared';
import type { OpenDoc } from './doc.js';

/** Row-major 2×3 affine matrix: [a, b, c, d, tx, ty] maps (x,y) → (a·x+c·y+tx, b·x+d·y+ty). */
export type Mat2x3 = readonly [number, number, number, number, number, number];

export const IDENTITY: Mat2x3 = [1, 0, 0, 1, 0, 0];

export function multiply(m: Mat2x3, n: Mat2x3): Mat2x3 {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

export function applyMatrix(m: Mat2x3, p: Vec2): Vec2 {
  return { x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] };
}

export function invert(m: Mat2x3): Mat2x3 {
  const det = m[0] * m[3] - m[1] * m[2];
  if (det === 0) return IDENTITY;
  const a = m[3] / det;
  const b = -m[1] / det;
  const c = -m[2] / det;
  const d = m[0] / det;
  return [a, b, c, d, -(a * m[4] + c * m[5]), -(b * m[4] + d * m[5])];
}

function translation(x: number, y: number): Mat2x3 {
  return [1, 0, 0, 1, x, y];
}

function rotationDeg(deg: number): Mat2x3 {
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return [cos, sin, -sin, cos, 0, 0];
}

/** Node's transform within its parent: translate to (x,y), rotate about the node center. */
export function nodeLocalMatrix(node: SceneNode): Mat2x3 {
  const t = translation(node.x, node.y);
  if (!node.rotation) return t;
  const cx = node.width / 2;
  const cy = node.height / 2;
  return multiply(
    t,
    multiply(translation(cx, cy), multiply(rotationDeg(node.rotation), translation(-cx, -cy))),
  );
}

export function getWorldMatrix(doc: OpenDoc, id: string): Mat2x3 {
  const chain: SceneNode[] = [];
  for (let cur: string | undefined = id; cur; cur = doc.getParentId(cur)) {
    const node = doc.getNode(cur);
    if (!node) break;
    chain.unshift(node);
  }
  let m = IDENTITY;
  for (const node of chain) m = multiply(m, nodeLocalMatrix(node));
  return m;
}

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Axis-aligned world-space bounding box (accounts for rotation of self and ancestors). */
export function getWorldBounds(doc: OpenDoc, id: string): Bounds {
  const node = doc.getNode(id);
  if (!node) throw new Error(`Node "${id}" does not exist`);
  const m = getWorldMatrix(doc, id);
  const corners = [
    applyMatrix(m, { x: 0, y: 0 }),
    applyMatrix(m, { x: node.width, y: 0 }),
    applyMatrix(m, { x: node.width, y: node.height }),
    applyMatrix(m, { x: 0, y: node.height }),
  ];
  const xs = corners.map((c) => c.x);
  const ys = corners.map((c) => c.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return { x: minX, y: minY, width: Math.max(...xs) - minX, height: Math.max(...ys) - minY };
}

const SELF_HITTABLE_CONTAINERS = new Set(['FRAME', 'COMPONENT', 'COMPONENT_SET', 'INSTANCE']);

function hitsOwnGeometry(node: SceneNode, local: Vec2): boolean {
  if (local.x < 0 || local.y < 0 || local.x > node.width || local.y > node.height) return false;
  if (node.type === 'ELLIPSE') {
    const rx = node.width / 2;
    const ry = node.height / 2;
    if (rx === 0 || ry === 0) return false;
    const dx = (local.x - rx) / rx;
    const dy = (local.y - ry) / ry;
    return dx * dx + dy * dy <= 1;
  }
  return true;
}

/**
 * Topmost hit node on a page at a point in page coordinates.
 * Skips invisible and locked nodes; GROUPs are transparent (children only).
 */
export function hitTest(doc: OpenDoc, pageId: string, point: Vec2): string | null {
  const visit = (id: string, pointInParent: Vec2): string | null => {
    const node = doc.getNode(id);
    if (!node || !node.visible || node.locked) return null;
    const local = applyMatrix(invert(nodeLocalMatrix(node)), pointInParent);
    const isContainer = CONTAINER_TYPES.has(node.type);

    if (!isContainer) return hitsOwnGeometry(node, local) ? id : null;

    const clips = (node as { clipsContent?: boolean }).clipsContent ?? false;
    const inBounds = local.x >= 0 && local.y >= 0 && local.x <= node.width && local.y <= node.height;
    if (clips && !inBounds) return null;

    const children = doc.getChildrenIds(id);
    for (let i = children.length - 1; i >= 0; i--) {
      const hit = visit(children[i]!, local);
      if (hit) return hit;
    }
    if (SELF_HITTABLE_CONTAINERS.has(node.type) && inBounds) return id;
    return null;
  };

  const children = doc.getChildrenIds(pageId);
  for (let i = children.length - 1; i >= 0; i--) {
    const hit = visit(children[i]!, point);
    if (hit) return hit;
  }
  return null;
}
