/**
 * How well openmake's importer currently handles a given Figma feature.
 * - SUPPORTED: fully converted, no data loss expected.
 * - PARTIAL: converts, but with known gaps or lossy approximations.
 * - UNSUPPORTED: recognized but intentionally dropped (with a report issue).
 * - PLANNED: not implemented yet; nodes/data using it are skipped.
 */
export type CompatibilityStatus = 'SUPPORTED' | 'PARTIAL' | 'UNSUPPORTED' | 'PLANNED';

/**
 * Honest, current-state compatibility matrix for Figma → openmake import.
 * Covers both importers: `parseFigmaRestDocument` (REST JSON, minimal
 * frame/rect/text/canvas conversion) and the experimental `parseFigFile`
 * (.fig binary) which additionally handles groups, basic shapes, components,
 * instances-as-placeholders, solid paints/strokes, shadow+blur effects,
 * blend modes, and stack-based auto-layout — all lossily (see the per-node
 * warning issues each import emits).
 */
export const compatibilityMatrix: Record<string, CompatibilityStatus> = {
  pages: 'PARTIAL',
  frames: 'PARTIAL',
  sections: 'PLANNED',
  // .fig: converted as children-only containers; group paints/effects dropped.
  groups: 'PARTIAL',
  // .fig: COMPONENT/COMPONENT_SET nodes convert (no descriptions/variants).
  components: 'PARTIAL',
  'component-sets': 'PARTIAL',
  variants: 'PLANNED',
  // .fig: placeholder frames with correct size/transform; no children,
  // overrides, or component links ('instance-not-resolved' warning).
  instances: 'PARTIAL',
  styles: 'PLANNED',
  variables: 'PLANNED',
  'design-tokens': 'PLANNED',
  // .fig: characters, family/size/align/letter-spacing/px-line-height only;
  // no weight/style mapping, no rich-text runs.
  text: 'PARTIAL',
  images: 'PLANNED',
  // .fig: gradient paints are recognized and dropped with a warning.
  gradients: 'UNSUPPORTED',
  svg: 'PLANNED',
  'vector-networks': 'PLANNED',
  'boolean-operations': 'PLANNED',
  masks: 'PLANNED',
  constraints: 'PLANNED',
  // .fig: stack mode/gap/padding/basic alignment; no wrap or advanced sizing.
  'auto-layout': 'PARTIAL',
  'grid-layout': 'PLANNED',
  prototypes: 'PLANNED',
  comments: 'PLANNED',
  libraries: 'PLANNED',
  // .fig: family names imported and missing families reported; no font files.
  fonts: 'PARTIAL',
  // .fig: drop/inner shadows and layer/background blur; others dropped.
  effects: 'PARTIAL',
  // .fig: matching enum names map 1:1; unknown modes normalize to NORMAL.
  'blend-modes': 'PARTIAL',
};
