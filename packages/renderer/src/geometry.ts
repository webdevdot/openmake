import type { CanvasKit, Path } from 'canvaskit-wasm';
import type { SceneNode } from '@openmake/shared';
import { regularPolygonPoints, starPoints } from '@openmake/core';

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
