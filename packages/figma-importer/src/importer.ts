import {
  DOCUMENT_SCHEMA_VERSION,
  createId,
  type Color,
  type DocumentData,
  type Paint,
  type SceneNode,
} from '@openmake/shared';
import type { ImportIssue, ImportResult } from './types.js';

// ---------------------------------------------------------------------------
// Minimal Figma REST API JSON shapes (only the fields we read).
// ---------------------------------------------------------------------------

interface FigmaRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface FigmaColor {
  r: number;
  g: number;
  b: number;
  a?: number;
}

interface FigmaPaint {
  type: string;
  visible?: boolean;
  color?: FigmaColor;
}

interface FigmaTextStyle {
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: number;
}

interface FigmaNode {
  id: string;
  name: string;
  type: string;
  visible?: boolean;
  opacity?: number;
  absoluteBoundingBox?: FigmaRect | null;
  fills?: FigmaPaint[];
  characters?: string;
  style?: FigmaTextStyle;
  children?: FigmaNode[];
}

interface FigmaRestDocument {
  document: FigmaNode;
  name?: string;
}

const SUPPORTED_FIGMA_TYPES = new Set(['DOCUMENT', 'CANVAS', 'FRAME', 'RECTANGLE', 'TEXT']);

function toColor(c: FigmaColor): Color {
  return { r: c.r, g: c.g, b: c.b, a: c.a ?? 1 };
}

function toFills(paints: FigmaPaint[] | undefined): Paint[] {
  if (!paints) return [];
  const fills: Paint[] = [];
  for (const p of paints) {
    if (p.type === 'SOLID' && p.color) {
      fills.push({ type: 'SOLID', color: toColor(p.color), opacity: 1, visible: p.visible ?? true });
    }
  }
  return fills;
}

/**
 * Convert a Figma REST-API `GET /v1/files/:key` document payload into an
 * openmake DocumentData. Only DOCUMENT/CANVAS/FRAME/RECTANGLE/TEXT are
 * understood; everything else is skipped and reported as an issue. Never
 * throws — always returns a report describing what happened.
 */
export function parseFigmaRestDocument(json: unknown): ImportResult {
  const issues: ImportIssue[] = [];
  const nodes: Record<string, SceneNode> = {};
  let imported = 0;
  let skipped = 0;

  const input = json as Partial<FigmaRestDocument> | null | undefined;
  const figmaRoot = input?.document;

  const rootId = createId('node');
  const documentNode: SceneNode = {
    id: rootId,
    name: input?.name ?? 'Imported document',
    type: 'DOCUMENT',
    visible: true,
    locked: false,
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    rotation: 0,
    opacity: 1,
    blendMode: 'NORMAL',
    children: [],
  };
  nodes[rootId] = documentNode;

  if (!figmaRoot) {
    issues.push({
      severity: 'error',
      code: 'missing-document',
      message: 'Input JSON has no `document` field; nothing was imported.',
    });
    return {
      document: buildDocument(rootId, nodes),
      report: { imported: 0, skipped: 0, issues, fontsMissing: [] },
    };
  }

  function convert(fig: FigmaNode, parentBox: FigmaRect | null, path: string): string | null {
    if (!SUPPORTED_FIGMA_TYPES.has(fig.type)) {
      skipped++;
      issues.push({
        severity: 'warning',
        code: 'unsupported-node-type',
        message: `Node type "${fig.type}" is not supported yet and was skipped.`,
        nodePath: path,
      });
      return null;
    }

    const id = createId('node');
    const box = fig.absoluteBoundingBox ?? null;
    const relX = box ? box.x - (parentBox?.x ?? box.x) : 0;
    const relY = box ? box.y - (parentBox?.y ?? box.y) : 0;
    const width = box?.width ?? 100;
    const height = box?.height ?? 100;

    if (fig.type === 'DOCUMENT') {
      const node: SceneNode = {
        id,
        name: fig.name,
        type: 'DOCUMENT',
        visible: fig.visible ?? true,
        locked: false,
        x: relX,
        y: relY,
        width,
        height,
        rotation: 0,
        opacity: fig.opacity ?? 1,
        blendMode: 'NORMAL',
        children: [],
      };
      nodes[id] = node;
      imported++;
      const childIds = (fig.children ?? [])
        .map((child, i) => convert(child, box, `${path}/${fig.name}[${i}]`))
        .filter((c): c is string => c !== null);
      node.children = childIds;
      return id;
    }

    if (fig.type === 'CANVAS') {
      const node: SceneNode = {
        id,
        name: fig.name,
        type: 'PAGE',
        visible: fig.visible ?? true,
        locked: false,
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        rotation: 0,
        opacity: 1,
        blendMode: 'NORMAL',
        children: [],
        backgroundColor: { r: 0.96, g: 0.96, b: 0.96, a: 1 },
      };
      nodes[id] = node;
      imported++;
      const childIds = (fig.children ?? [])
        .map((child, i) => convert(child, box, `${path}/${fig.name}[${i}]`))
        .filter((c): c is string => c !== null);
      node.children = childIds;
      return id;
    }

    if (fig.type === 'FRAME') {
      const node: SceneNode = {
        id,
        name: fig.name,
        type: 'FRAME',
        visible: fig.visible ?? true,
        locked: false,
        x: relX,
        y: relY,
        width,
        height,
        rotation: 0,
        opacity: fig.opacity ?? 1,
        blendMode: 'NORMAL',
        fills: toFills(fig.fills),
        strokes: [],
        effects: [],
        children: [],
        clipsContent: true,
        cornerRadius: 0,
      };
      nodes[id] = node;
      imported++;
      const childIds = (fig.children ?? [])
        .map((child, i) => convert(child, box, `${path}/${fig.name}[${i}]`))
        .filter((c): c is string => c !== null);
      node.children = childIds;
      return id;
    }

    if (fig.type === 'RECTANGLE') {
      const node: SceneNode = {
        id,
        name: fig.name,
        type: 'RECTANGLE',
        visible: fig.visible ?? true,
        locked: false,
        x: relX,
        y: relY,
        width,
        height,
        rotation: 0,
        opacity: fig.opacity ?? 1,
        blendMode: 'NORMAL',
        fills: toFills(fig.fills),
        strokes: [],
        effects: [],
        cornerRadius: 0,
      };
      nodes[id] = node;
      imported++;
      return id;
    }

    // TEXT
    const node: SceneNode = {
      id,
      name: fig.name,
      type: 'TEXT',
      visible: fig.visible ?? true,
      locked: false,
      x: relX,
      y: relY,
      width,
      height,
      rotation: 0,
      opacity: fig.opacity ?? 1,
      blendMode: 'NORMAL',
      fills: toFills(fig.fills),
      strokes: [],
      effects: [],
      characters: fig.characters ?? '',
      textStyle: {
        fontFamily: fig.style?.fontFamily ?? 'Inter',
        fontSize: fig.style?.fontSize ?? 16,
        fontWeight: fig.style?.fontWeight ?? 400,
        fontStyle: 'NORMAL',
        lineHeight: 'AUTO',
        letterSpacing: 0,
        textAlign: 'LEFT',
        textDecoration: 'NONE',
      },
      autoResize: 'WIDTH_AND_HEIGHT',
    };
    nodes[id] = node;
    imported++;
    return id;
  }

  const convertedRootId = convert(figmaRoot, null, figmaRoot.name ?? 'document');
  if (convertedRootId) {
    documentNode.children = [convertedRootId];
  }

  return {
    document: buildDocument(rootId, nodes),
    report: { imported, skipped, issues, fontsMissing: [] },
  };
}

function buildDocument(rootId: string, nodes: Record<string, SceneNode>): DocumentData {
  return {
    schemaVersion: DOCUMENT_SCHEMA_VERSION,
    id: createId('doc'),
    name: (nodes[rootId] as { name: string } | undefined)?.name ?? 'Imported document',
    rootId,
    nodes,
    variables: {},
    variableModes: [{ id: 'default', name: 'Default' }],
    styles: {},
    assets: {},
  };
}
