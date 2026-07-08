import type { OpenDoc } from './doc.js';
import { applyMatrix, getWorldBounds, getWorldMatrix, invert, type Bounds } from './geometry.js';

/** Which edge (or center axis) of the bounding boxes to line up. */
export type AlignEdge = 'left' | 'centerX' | 'right' | 'top' | 'centerY' | 'bottom';

/** Axis along which to evenly space nodes. */
export type DistributeAxis = 'x' | 'y';

/** Axis to mirror a node across. */
export type FlipAxis = 'x' | 'y';

/**
 * Translate a node so that its world-space AABB moves by (dx, dy) in world
 * coordinates. Because a node stores a *local* (x, y) and may sit under rotated
 * ancestors, we convert the world-space delta into the parent's local frame via
 * the parent's inverse linear map, then add it to the node's current x/y.
 */
function translateWorld(doc: OpenDoc, id: string, dx: number, dy: number): void {
  const node = doc.getNode(id);
  if (!node) return;
  if (dx === 0 && dy === 0) return;
  const parentId = doc.getParentId(id);
  // Map the world delta into the parent's local space (linear part only — a pure
  // translation is unaffected by the matrix's own translation component).
  const parentInv = parentId
    ? invert(getWorldMatrix(doc, parentId))
    : invert(getWorldMatrix(doc, id));
  const origin = applyMatrix(parentInv, { x: 0, y: 0 });
  const shifted = applyMatrix(parentInv, { x: dx, y: dy });
  doc.updateNode(id, { x: node.x + (shifted.x - origin.x), y: node.y + (shifted.y - origin.y) });
}

/** Union of the world-space AABBs of the given nodes. */
function unionBounds(doc: OpenDoc, ids: string[]): Bounds | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let found = false;
  for (const id of ids) {
    if (!doc.getNode(id)) continue;
    const b = getWorldBounds(doc, id);
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width);
    maxY = Math.max(maxY, b.y + b.height);
    found = true;
  }
  if (!found) return null;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * The bounds a single node aligns *within*: its nearest ancestor FRAME's world
 * AABB. Returns null when the node has no FRAME ancestor (single-select align is
 * then a no-op — there is no container to align against).
 */
function frameBoundsFor(doc: OpenDoc, id: string): Bounds | null {
  for (let cur = doc.getParentId(id); cur; cur = doc.getParentId(cur)) {
    const node = doc.getNode(cur);
    if (!node) break;
    if (node.type === 'FRAME') return getWorldBounds(doc, cur);
  }
  return null;
}

/** World-space delta a node's AABB must move to hit `edge` of `within`. */
function edgeDelta(
  nodeBounds: Bounds,
  within: Bounds,
  edge: AlignEdge,
): { dx: number; dy: number } {
  switch (edge) {
    case 'left':
      return { dx: within.x - nodeBounds.x, dy: 0 };
    case 'right':
      return { dx: within.x + within.width - (nodeBounds.x + nodeBounds.width), dy: 0 };
    case 'centerX':
      return { dx: within.x + within.width / 2 - (nodeBounds.x + nodeBounds.width / 2), dy: 0 };
    case 'top':
      return { dx: 0, dy: within.y - nodeBounds.y };
    case 'bottom':
      return { dx: 0, dy: within.y + within.height - (nodeBounds.y + nodeBounds.height) };
    case 'centerY':
      return { dx: 0, dy: within.y + within.height / 2 - (nodeBounds.y + nodeBounds.height / 2) };
  }
}

/**
 * Align nodes to an edge/center of a reference box.
 *
 * - Multi-select (>= 2 ids): each node aligns within the selection's union AABB.
 * - Single id: aligns within its nearest ancestor FRAME's bounds; no-op if the
 *   node has no FRAME ancestor.
 *
 * All moves run in one transaction so undo reverts the whole align in one step.
 */
export function alignNodes(doc: OpenDoc, ids: string[], edge: AlignEdge): void {
  const valid = [...new Set(ids)].filter((id) => doc.getNode(id));
  if (valid.length === 0) return;

  doc.transact(() => {
    if (valid.length === 1) {
      const id = valid[0]!;
      const within = frameBoundsFor(doc, id);
      if (!within) return;
      const { dx, dy } = edgeDelta(getWorldBounds(doc, id), within, edge);
      translateWorld(doc, id, dx, dy);
      return;
    }

    const within = unionBounds(doc, valid);
    if (!within) return;
    for (const id of valid) {
      const { dx, dy } = edgeDelta(getWorldBounds(doc, id), within, edge);
      translateWorld(doc, id, dx, dy);
    }
  });
}

/**
 * Evenly space nodes along an axis: the outer two nodes stay put and the inner
 * nodes are repositioned so successive AABB centers are equally spaced.
 * Requires >= 3 nodes; fewer is a no-op. One transaction (single undo step).
 */
export function distributeNodes(doc: OpenDoc, ids: string[], axis: DistributeAxis): void {
  const valid = [...new Set(ids)].filter((id) => doc.getNode(id));
  if (valid.length < 3) return;

  const center = (b: Bounds) => (axis === 'x' ? b.x + b.width / 2 : b.y + b.height / 2);

  const entries = valid
    .map((id) => ({ id, bounds: getWorldBounds(doc, id) }))
    .sort((a, b) => center(a.bounds) - center(b.bounds));

  const start = center(entries[0]!.bounds);
  const end = center(entries[entries.length - 1]!.bounds);
  const step = (end - start) / (entries.length - 1);

  doc.transact(() => {
    entries.forEach((entry, i) => {
      if (i === 0 || i === entries.length - 1) return;
      const delta = start + step * i - center(entry.bounds);
      if (axis === 'x') translateWorld(doc, entry.id, delta, 0);
      else translateWorld(doc, entry.id, 0, delta);
    });
  });
}

function normalizeAngle(deg: number): number {
  let a = deg % 360;
  if (a > 180) a -= 360;
  if (a <= -180) a += 360;
  return a;
}

/**
 * Reflect an SVG path's coordinates within a `width`×`height` box across the
 * given axis. Numeric coordinate pairs are reflected in order; command letters
 * pass through unchanged. Sufficient for the polyline paths the pen/vector
 * tooling currently emits (absolute M/L segments).
 */
function reflectPath(path: string, axis: FlipAxis, width: number, height: number): string {
  const tokens = path.match(/[a-zA-Z]|-?\d*\.?\d+(?:e-?\d+)?/g);
  if (!tokens) return path;
  const out: string[] = [];
  let expectX = true;
  for (const tok of tokens) {
    if (/[a-zA-Z]/.test(tok)) {
      out.push(tok);
      expectX = true;
      continue;
    }
    const n = Number(tok);
    if (Number.isNaN(n)) {
      out.push(tok);
      continue;
    }
    if (expectX) {
      out.push(String(axis === 'x' ? width - n : n));
    } else {
      out.push(String(axis === 'y' ? height - n : n));
    }
    expectX = !expectX;
  }
  return out.join(' ');
}

/**
 * Flip (mirror) a node across an axis.
 *
 * The document schema (packages/shared) has NO per-node flip / negative-scale
 * field — `base` carries only x/y/width/height/rotation/opacity, and there is no
 * scaleX/scaleY or mirror flag. A true pixel mirror of a filled shape is
 * therefore not representable. We implement the honest subset the schema can
 * express:
 *
 *  - VECTOR: the node stores explicit `path` data in node-local coordinates, so
 *    we reflect those coordinates within the node's box — a real content mirror.
 *  - Every other node type (RECTANGLE, ELLIPSE, LINE, TEXT, …): mirroring about
 *    the node's own centered AABB leaves the box fixed, so flip instead mirrors
 *    the node's *orientation*: flipping X reflects the rotation angle
 *    (rotation -> -rotation) and flipping Y reflects it about the horizontal
 *    (rotation -> 180 - rotation). Width/height are preserved.
 *
 * This is a v1 orientation flip; full content mirroring awaits a scaleX/scaleY
 * schema field. Runs in one transaction (single undo step).
 */
export function flipNode(doc: OpenDoc, id: string, axis: FlipAxis): void {
  const node = doc.getNode(id);
  if (!node) return;

  doc.transact(() => {
    if (node.type === 'VECTOR') {
      doc.updateNode(id, { path: reflectPath(node.path, axis, node.width, node.height) });
      return;
    }
    const r = normalizeAngle(node.rotation);
    const flipped = axis === 'x' ? normalizeAngle(-r) : normalizeAngle(180 - r);
    doc.updateNode(id, { rotation: flipped });
  });
}
