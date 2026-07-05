import type { CanvasKit, Path } from 'canvaskit-wasm';
import type { SceneNode } from '@openmake/shared';

type EllipseNode = Extract<SceneNode, { type: 'ELLIPSE' }>;
type PolygonNode = Extract<SceneNode, { type: 'POLYGON' }>;
type StarNode = Extract<SceneNode, { type: 'STAR' }>;

/** Node-local rect covering the node's own width/height, as [l, t, r, b]. */
export function nodeRect(ck: CanvasKit, width: number, height: number): Float32Array {
  return ck.LTRBRect(0, 0, width, height);
}

export function ellipsePath(ck: CanvasKit, node: EllipseNode): Path {
  const oval = ck.LTRBRect(0, 0, node.width, node.height);
  const builder = new ck.PathBuilder();
  if (node.arc && node.arc.sweep !== 360) {
    builder.addArc(oval, node.arc.start, node.arc.sweep);
    builder.close();
  } else {
    builder.addOval(oval);
  }
  return builder.detach();
}

/** Regular polygon inscribed in the node's bounding box, point-up. */
export function polygonPath(ck: CanvasKit, node: PolygonNode): Path {
  const points = regularPolygonPoints(node.width, node.height, node.pointCount);
  const builder = new ck.PathBuilder();
  builder.addPolygon(points, true);
  return builder.detach();
}

/** Star with alternating outer/inner vertices, inscribed in the node's bounding box. */
export function starPath(ck: CanvasKit, node: StarNode): Path {
  const points = starPoints(node.width, node.height, node.pointCount, node.innerRadius);
  const builder = new ck.PathBuilder();
  builder.addPolygon(points, true);
  return builder.detach();
}

function regularPolygonPoints(width: number, height: number, count: number): number[] {
  const cx = width / 2;
  const cy = height / 2;
  const rx = width / 2;
  const ry = height / 2;
  const points: number[] = [];
  for (let i = 0; i < count; i++) {
    // Start at the top (-90deg) and go clockwise.
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / count;
    points.push(cx + rx * Math.cos(angle), cy + ry * Math.sin(angle));
  }
  return points;
}

function starPoints(width: number, height: number, count: number, innerRadius: number): number[] {
  const cx = width / 2;
  const cy = height / 2;
  const rx = width / 2;
  const ry = height / 2;
  const points: number[] = [];
  const total = count * 2;
  for (let i = 0; i < total; i++) {
    const angle = -Math.PI / 2 + (i * Math.PI) / count;
    const scale = i % 2 === 0 ? 1 : innerRadius;
    points.push(cx + rx * scale * Math.cos(angle), cy + ry * scale * Math.sin(angle));
  }
  return points;
}
