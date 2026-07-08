import type { SceneNode } from '@openmake/shared';
import type { OpenDoc } from './doc.js';

/** Property values parsed from a component name, e.g. { State: "hover", Size: "lg" }. */
export type VariantProps = Record<string, string>;

export interface ParsedVariantName {
  /** Parsed `Prop=Value` pairs. */
  props: VariantProps;
  /**
   * True when the name did not contain any `Prop=Value` pair and we fell back
   * to the default `Variant=<name>` property (Figma's behavior).
   */
  isDefault: boolean;
}

/** Default variant property name used when a component name doesn't parse. */
export const DEFAULT_VARIANT_PROP = 'Variant';

/**
 * Parse a component name into variant properties using Figma's convention:
 * `Prop=Value, Prop2=Value2`. Whitespace around keys/values is trimmed. Names
 * that contain no `=` pair get a single `Variant=<name>` property so every
 * component in a set is still addressable.
 */
export function parseVariantName(name: string): ParsedVariantName {
  const props: VariantProps = {};
  for (const rawPair of name.split(',')) {
    const eq = rawPair.indexOf('=');
    if (eq < 0) continue;
    const key = rawPair.slice(0, eq).trim();
    const value = rawPair.slice(eq + 1).trim();
    if (key) props[key] = value;
  }
  if (Object.keys(props).length === 0) {
    return { props: { [DEFAULT_VARIANT_PROP]: name.trim() }, isDefault: true };
  }
  return { props, isDefault: false };
}

/**
 * Build the variant matrix of a COMPONENT_SET: for each variant property name,
 * the distinct values present across its member components, in first-seen order.
 */
export function variantMatrixOf(doc: OpenDoc, setId: string): Record<string, string[]> {
  const set = doc.getNode(setId);
  if (set?.type !== 'COMPONENT_SET') {
    throw new Error(`Node "${setId}" is not a component set`);
  }
  const matrix: Record<string, string[]> = {};
  for (const childId of doc.getChildrenIds(setId)) {
    const child = doc.getNode(childId);
    if (child?.type !== 'COMPONENT') continue;
    const props = child.variantProperties ?? {};
    for (const [key, value] of Object.entries(props)) {
      const values = (matrix[key] ??= []);
      if (!values.includes(value)) values.push(value);
    }
  }
  return matrix;
}

/**
 * Find the member component of a COMPONENT_SET whose `variantProperties` match
 * the requested props for every requested key. Returns the component id, or
 * undefined when no member matches. When multiple match, the first in document
 * order wins.
 */
export function findVariant(
  doc: OpenDoc,
  setId: string,
  props: VariantProps,
): string | undefined {
  const set = doc.getNode(setId);
  if (set?.type !== 'COMPONENT_SET') {
    throw new Error(`Node "${setId}" is not a component set`);
  }
  const wanted = Object.entries(props);
  for (const childId of doc.getChildrenIds(setId)) {
    const child = doc.getNode(childId);
    if (child?.type !== 'COMPONENT') continue;
    const cp = child.variantProperties ?? {};
    if (wanted.every(([k, v]) => cp[k] === v)) return childId;
  }
  return undefined;
}

/** The variant properties of a single component (empty object if none). */
export function variantPropsOf(node: SceneNode): VariantProps {
  return node.type === 'COMPONENT' ? (node.variantProperties ?? {}) : {};
}
