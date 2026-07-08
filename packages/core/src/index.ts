export { OpenDoc, LOCAL_ORIGIN, type CreateNodeInput } from './doc.js';
export {
  getWorldBounds,
  getWorldMatrix,
  hitTest,
  nodeLocalMatrix,
  multiply,
  invert,
  applyMatrix,
  regularPolygonPoints,
  starPoints,
  IDENTITY,
  type Bounds,
  type Mat2x3,
} from './geometry.js';
export {
  resolveSnap,
  type SnapCandidateBox,
  type SnapConfig,
  type SnapGuide,
  type SnapResult,
} from './snap.js';
export { resolveInstance, type ResolvedInstance } from './instances.js';
