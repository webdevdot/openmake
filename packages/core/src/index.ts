export {
  OpenDoc,
  LOCAL_ORIGIN,
  replaceDocContent,
  resolveVariableValue,
  type CreateNodeInput,
} from './doc.js';
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
export {
  parseVariantName,
  variantMatrixOf,
  findVariant,
  variantPropsOf,
  DEFAULT_VARIANT_PROP,
  type VariantProps,
  type ParsedVariantName,
} from './variants.js';
export {
  alignNodes,
  distributeNodes,
  flipNode,
  type AlignEdge,
  type DistributeAxis,
  type FlipAxis,
} from './align.js';
export {
  sampleAnimation,
  stackAnimation,
  fadeIn,
  fadeOut,
  rotate,
  scaleIn,
  scaleOut,
  resize,
  type PresetContext,
} from './animation.js';
