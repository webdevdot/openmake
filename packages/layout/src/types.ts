/** Partial geometry update — only fields that actually changed are present. */
export interface LayoutPatch {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}
