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
 * `parseFigmaRestDocument` only implements a minimal frame/rect/text/canvas
 * conversion today, so most rows are PLANNED until dedicated converters land.
 */
export const compatibilityMatrix: Record<string, CompatibilityStatus> = {
  pages: 'PARTIAL',
  frames: 'PARTIAL',
  sections: 'PLANNED',
  groups: 'PLANNED',
  components: 'PLANNED',
  'component-sets': 'PLANNED',
  variants: 'PLANNED',
  instances: 'PLANNED',
  styles: 'PLANNED',
  variables: 'PLANNED',
  'design-tokens': 'PLANNED',
  text: 'PARTIAL',
  images: 'PLANNED',
  svg: 'PLANNED',
  'vector-networks': 'PLANNED',
  'boolean-operations': 'PLANNED',
  masks: 'PLANNED',
  constraints: 'PLANNED',
  'auto-layout': 'PLANNED',
  'grid-layout': 'PLANNED',
  prototypes: 'PLANNED',
  comments: 'PLANNED',
  libraries: 'PLANNED',
  fonts: 'PLANNED',
  effects: 'PLANNED',
  'blend-modes': 'PLANNED',
};
