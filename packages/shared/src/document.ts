import { z } from 'zod';

// ---------------------------------------------------------------------------
// Geometry & color
// ---------------------------------------------------------------------------

export const Vec2Schema = z.object({ x: z.number(), y: z.number() });
export type Vec2 = z.infer<typeof Vec2Schema>;

/** Channels are 0–1 floats. */
export const ColorSchema = z.object({
  r: z.number().min(0).max(1),
  g: z.number().min(0).max(1),
  b: z.number().min(0).max(1),
  a: z.number().min(0).max(1),
});
export type Color = z.infer<typeof ColorSchema>;

// ---------------------------------------------------------------------------
// Paints, strokes, effects
// ---------------------------------------------------------------------------

export const SolidPaintSchema = z.object({
  type: z.literal('SOLID'),
  color: ColorSchema,
  opacity: z.number().min(0).max(1).default(1),
  visible: z.boolean().default(true),
});

export const GradientStopSchema = z.object({
  position: z.number().min(0).max(1),
  color: ColorSchema,
});

export const GradientPaintSchema = z.object({
  type: z.enum(['GRADIENT_LINEAR', 'GRADIENT_RADIAL']),
  /** Endpoints in normalized (0–1) node space. */
  from: Vec2Schema,
  to: Vec2Schema,
  stops: z.array(GradientStopSchema).min(2),
  opacity: z.number().min(0).max(1).default(1),
  visible: z.boolean().default(true),
});

export const ImagePaintSchema = z.object({
  type: z.literal('IMAGE'),
  /** References DocumentData.assets. */
  assetId: z.string(),
  scaleMode: z.enum(['FILL', 'FIT', 'TILE', 'STRETCH']).default('FILL'),
  opacity: z.number().min(0).max(1).default(1),
  visible: z.boolean().default(true),
});

export const PaintSchema = z.discriminatedUnion('type', [
  SolidPaintSchema,
  GradientPaintSchema,
  ImagePaintSchema,
]);
export type Paint = z.infer<typeof PaintSchema>;
export type SolidPaint = z.infer<typeof SolidPaintSchema>;
export type GradientPaint = z.infer<typeof GradientPaintSchema>;
export type ImagePaint = z.infer<typeof ImagePaintSchema>;

export const StrokeSchema = z.object({
  paint: PaintSchema,
  weight: z.number().min(0),
  align: z.enum(['INSIDE', 'CENTER', 'OUTSIDE']).default('INSIDE'),
  dashPattern: z.array(z.number().min(0)).optional(),
});
export type Stroke = z.infer<typeof StrokeSchema>;

export const ShadowEffectSchema = z.object({
  type: z.enum(['DROP_SHADOW', 'INNER_SHADOW']),
  color: ColorSchema,
  offset: Vec2Schema,
  blur: z.number().min(0),
  spread: z.number().default(0),
  visible: z.boolean().default(true),
});

export const BlurEffectSchema = z.object({
  type: z.enum(['LAYER_BLUR', 'BACKGROUND_BLUR']),
  radius: z.number().min(0),
  visible: z.boolean().default(true),
});

export const EffectSchema = z.union([ShadowEffectSchema, BlurEffectSchema]);
export type Effect = z.infer<typeof EffectSchema>;

export const BlendModeSchema = z.enum([
  'NORMAL',
  'MULTIPLY',
  'SCREEN',
  'OVERLAY',
  'DARKEN',
  'LIGHTEN',
  'COLOR_DODGE',
  'COLOR_BURN',
  'HARD_LIGHT',
  'SOFT_LIGHT',
  'DIFFERENCE',
  'EXCLUSION',
  'HUE',
  'SATURATION',
  'COLOR',
  'LUMINOSITY',
]);
export type BlendMode = z.infer<typeof BlendModeSchema>;

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export const ConstraintTypeSchema = z.enum(['MIN', 'MAX', 'CENTER', 'STRETCH', 'SCALE']);
export const ConstraintsSchema = z.object({
  horizontal: ConstraintTypeSchema.default('MIN'),
  vertical: ConstraintTypeSchema.default('MIN'),
});
export type Constraints = z.infer<typeof ConstraintsSchema>;

export const SizingModeSchema = z.enum(['FIXED', 'HUG', 'FILL']);
export type SizingMode = z.infer<typeof SizingModeSchema>;

export const AutoLayoutSchema = z.object({
  mode: z.enum(['HORIZONTAL', 'VERTICAL']),
  gap: z.number().default(0),
  paddingTop: z.number().default(0),
  paddingRight: z.number().default(0),
  paddingBottom: z.number().default(0),
  paddingLeft: z.number().default(0),
  /** Cross-axis alignment of children. */
  alignItems: z.enum(['MIN', 'CENTER', 'MAX', 'BASELINE']).default('MIN'),
  /** Main-axis distribution. */
  justifyContent: z.enum(['MIN', 'CENTER', 'MAX', 'SPACE_BETWEEN']).default('MIN'),
  wrap: z.boolean().default(false),
});
export type AutoLayout = z.infer<typeof AutoLayoutSchema>;

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

export const TextStyleSchema = z.object({
  fontFamily: z.string().default('Inter'),
  fontSize: z.number().min(1).default(16),
  fontWeight: z.number().min(100).max(1000).default(400),
  fontStyle: z.enum(['NORMAL', 'ITALIC']).default('NORMAL'),
  /** Multiplier of fontSize; 'AUTO' ≈ 1.2. */
  lineHeight: z.union([z.number(), z.literal('AUTO')]).default('AUTO'),
  letterSpacing: z.number().default(0),
  textAlign: z.enum(['LEFT', 'CENTER', 'RIGHT', 'JUSTIFY']).default('LEFT'),
  textDecoration: z.enum(['NONE', 'UNDERLINE', 'STRIKETHROUGH']).default('NONE'),
});
export type TextStyle = z.infer<typeof TextStyleSchema>;

// ---------------------------------------------------------------------------
// Prototyping
// ---------------------------------------------------------------------------

export const TransitionSchema = z.object({
  type: z.enum(['INSTANT', 'DISSOLVE', 'SLIDE_IN', 'SLIDE_OUT', 'PUSH']).default('INSTANT'),
  durationMs: z.number().min(0).default(300),
});

export const ReactionSchema = z.object({
  trigger: z.enum(['ON_CLICK', 'ON_HOVER', 'AFTER_DELAY']),
  delayMs: z.number().min(0).optional(),
  action: z.object({
    type: z.enum(['NAVIGATE', 'BACK', 'OPEN_URL']),
    destinationId: z.string().optional(),
    url: z.string().optional(),
    transition: TransitionSchema.optional(),
  }),
});
export type Reaction = z.infer<typeof ReactionSchema>;

// ---------------------------------------------------------------------------
// Nodes (flat map: children are id arrays, never nested objects)
// ---------------------------------------------------------------------------

export const NODE_TYPES = [
  'DOCUMENT',
  'PAGE',
  'FRAME',
  'GROUP',
  'RECTANGLE',
  'ELLIPSE',
  'POLYGON',
  'STAR',
  'LINE',
  'VECTOR',
  'TEXT',
  'COMPONENT',
  'COMPONENT_SET',
  'INSTANCE',
] as const;
export const NodeTypeSchema = z.enum(NODE_TYPES);
export type NodeType = z.infer<typeof NodeTypeSchema>;

const base = {
  id: z.string(),
  name: z.string(),
  visible: z.boolean().default(true),
  locked: z.boolean().default(false),
  x: z.number().default(0),
  y: z.number().default(0),
  width: z.number().min(0).default(100),
  height: z.number().min(0).default(100),
  rotation: z.number().default(0),
  opacity: z.number().min(0).max(1).default(1),
  blendMode: BlendModeSchema.default('NORMAL'),
  constraints: ConstraintsSchema.optional(),
  /** Per-field variable bindings, e.g. { "fills.0.color": "var_x" }. */
  boundVariables: z.record(z.string(), z.string()).optional(),
  reactions: z.array(ReactionSchema).optional(),
  /** Sizing behavior when inside an auto-layout parent. */
  layoutSizingHorizontal: SizingModeSchema.optional(),
  layoutSizingVertical: SizingModeSchema.optional(),
};

const geometry = {
  fills: z.array(PaintSchema).default([]),
  strokes: z.array(StrokeSchema).default([]),
  effects: z.array(EffectSchema).default([]),
};

const container = {
  children: z.array(z.string()).default([]),
  clipsContent: z.boolean().default(true),
  autoLayout: AutoLayoutSchema.optional(),
  cornerRadius: z.number().min(0).default(0),
};

export const DocumentNodeSchema = z.object({
  ...base,
  type: z.literal('DOCUMENT'),
  children: z.array(z.string()).default([]),
});

export const PageNodeSchema = z.object({
  ...base,
  type: z.literal('PAGE'),
  children: z.array(z.string()).default([]),
  backgroundColor: ColorSchema.default({ r: 0.96, g: 0.96, b: 0.96, a: 1 }),
});

export const FrameNodeSchema = z.object({ ...base, ...geometry, ...container, type: z.literal('FRAME') });
export const GroupNodeSchema = z.object({
  ...base,
  type: z.literal('GROUP'),
  children: z.array(z.string()).default([]),
});
export const RectangleNodeSchema = z.object({
  ...base,
  ...geometry,
  type: z.literal('RECTANGLE'),
  cornerRadius: z.number().min(0).default(0),
});
export const EllipseNodeSchema = z.object({
  ...base,
  ...geometry,
  type: z.literal('ELLIPSE'),
  /** Degrees; full ellipse when sweep is 360. */
  arc: z.object({ start: z.number(), sweep: z.number() }).optional(),
});
export const PolygonNodeSchema = z.object({
  ...base,
  ...geometry,
  type: z.literal('POLYGON'),
  pointCount: z.number().int().min(3).default(3),
});
export const StarNodeSchema = z.object({
  ...base,
  ...geometry,
  type: z.literal('STAR'),
  pointCount: z.number().int().min(3).default(5),
  /** Inner radius as fraction of outer radius. */
  innerRadius: z.number().min(0).max(1).default(0.38),
});
export const LineNodeSchema = z.object({ ...base, ...geometry, type: z.literal('LINE') });
export const VectorNodeSchema = z.object({
  ...base,
  ...geometry,
  type: z.literal('VECTOR'),
  /** SVG path data in node-local coordinates. */
  path: z.string().default(''),
});
export const TextNodeSchema = z.object({
  ...base,
  ...geometry,
  type: z.literal('TEXT'),
  characters: z.string().default(''),
  textStyle: TextStyleSchema.default({
    fontFamily: 'Inter',
    fontSize: 16,
    fontWeight: 400,
    fontStyle: 'NORMAL',
    lineHeight: 'AUTO',
    letterSpacing: 0,
    textAlign: 'LEFT',
    textDecoration: 'NONE',
  }),
  autoResize: z.enum(['NONE', 'HEIGHT', 'WIDTH_AND_HEIGHT']).default('WIDTH_AND_HEIGHT'),
});
export const ComponentNodeSchema = z.object({
  ...base,
  ...geometry,
  ...container,
  type: z.literal('COMPONENT'),
  description: z.string().default(''),
  /** Variant property values when inside a COMPONENT_SET, e.g. { size: "lg" }. */
  variantProperties: z.record(z.string(), z.string()).optional(),
});
export const ComponentSetNodeSchema = z.object({
  ...base,
  ...geometry,
  ...container,
  type: z.literal('COMPONENT_SET'),
  description: z.string().default(''),
});
export const InstanceNodeSchema = z.object({
  ...base,
  ...geometry,
  ...container,
  type: z.literal('INSTANCE'),
  componentId: z.string(),
  /** Sparse per-node property overrides, keyed by source node id. */
  overrides: z.record(z.string(), z.record(z.string(), z.unknown())).default({}),
});

export const SceneNodeSchema = z.discriminatedUnion('type', [
  DocumentNodeSchema,
  PageNodeSchema,
  FrameNodeSchema,
  GroupNodeSchema,
  RectangleNodeSchema,
  EllipseNodeSchema,
  PolygonNodeSchema,
  StarNodeSchema,
  LineNodeSchema,
  VectorNodeSchema,
  TextNodeSchema,
  ComponentNodeSchema,
  ComponentSetNodeSchema,
  InstanceNodeSchema,
]);
export type SceneNode = z.infer<typeof SceneNodeSchema>;
export type DocumentNode = z.infer<typeof DocumentNodeSchema>;
export type PageNode = z.infer<typeof PageNodeSchema>;
export type FrameNode = z.infer<typeof FrameNodeSchema>;
export type TextNode = z.infer<typeof TextNodeSchema>;
export type ComponentNode = z.infer<typeof ComponentNodeSchema>;
export type InstanceNode = z.infer<typeof InstanceNodeSchema>;

/** Node types that may have children. */
export const CONTAINER_TYPES: ReadonlySet<NodeType> = new Set([
  'DOCUMENT',
  'PAGE',
  'FRAME',
  'GROUP',
  'COMPONENT',
  'COMPONENT_SET',
  'INSTANCE',
]);

// ---------------------------------------------------------------------------
// Variables (design tokens), styles, assets
// ---------------------------------------------------------------------------

export const VariableSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(['COLOR', 'FLOAT', 'STRING', 'BOOLEAN']),
  /** modeId → value; value shape depends on `type`. */
  valuesByMode: z.record(z.string(), z.unknown()),
});
export type Variable = z.infer<typeof VariableSchema>;

export const VariableModeSchema = z.object({ id: z.string(), name: z.string() });

export const StyleSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(['FILL', 'TEXT', 'EFFECT', 'STROKE']),
  value: z.unknown(),
});
export type Style = z.infer<typeof StyleSchema>;

export const AssetRefSchema = z.object({
  hash: z.string(),
  mime: z.string(),
  width: z.number().optional(),
  height: z.number().optional(),
});
export type AssetRef = z.infer<typeof AssetRefSchema>;

// ---------------------------------------------------------------------------
// Document
// ---------------------------------------------------------------------------

export const DOCUMENT_SCHEMA_VERSION = 1;

export const DocumentDataSchema = z.object({
  schemaVersion: z.literal(DOCUMENT_SCHEMA_VERSION),
  id: z.string(),
  name: z.string(),
  rootId: z.string(),
  nodes: z.record(z.string(), SceneNodeSchema),
  variables: z.record(z.string(), VariableSchema).default({}),
  variableModes: z.array(VariableModeSchema).default([]),
  styles: z.record(z.string(), StyleSchema).default({}),
  assets: z.record(z.string(), AssetRefSchema).default({}),
});
export type DocumentData = z.infer<typeof DocumentDataSchema>;
