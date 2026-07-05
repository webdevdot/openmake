import type { NodeType, SceneNode, Style, Variable } from './document.js';

/**
 * The structured design context handed to AI (Context Builder Engine output).
 * Contract consumed by @openmake/ai, @openmake/codegen, and @openmake/mcp —
 * only the minimum required information for the current selection.
 */
export interface DesignContext {
  document: { id: string; name: string };
  selection: SelectedNodeContext[];
  /** Only variables referenced (bound) within the selection subtrees. */
  variables: Record<string, Variable>;
  /** Only styles referenced within the selection subtrees. */
  styles: Record<string, Style>;
}

export interface SelectedNodeContext {
  /** Full snapshot of the selected node (instances resolved to concrete nodes). */
  node: SceneNode;
  /** Ancestor chain, root → immediate parent. */
  path: Array<{ id: string; name: string; type: NodeType }>;
  /** Subtree below the node, flat, instances expanded; depth-limited by the builder. */
  descendants: Record<string, SceneNode>;
  /** Ordered children ids for every container in `descendants` (and the node itself). */
  childrenOrder: Record<string, string[]>;
  /** Present when the node is a component or an instance of one. */
  component?: {
    id: string;
    name: string;
    description: string;
    variantProperties?: Record<string, string>;
  };
}

/** Code-generation targets supported by @openmake/codegen. */
export const CODEGEN_FRAMEWORKS = [
  'REACT',
  'NEXTJS',
  'VUE',
  'ANGULAR',
  'FLUTTER',
  'SWIFTUI',
  'COMPOSE',
  'HTML_CSS',
  'HTML_TAILWIND',
] as const;
export type CodegenFramework = (typeof CODEGEN_FRAMEWORKS)[number];
