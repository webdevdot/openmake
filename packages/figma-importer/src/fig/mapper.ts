import {
  DOCUMENT_SCHEMA_VERSION,
  createId,
  type AutoLayout,
  type BlendMode,
  type Color,
  type DocumentData,
  type DocumentNode,
  type Effect,
  type Paint,
  type SceneNode,
  type Stroke,
  type TextStyle,
} from '@openmake/shared';
import type { ImportIssue, ImportResult } from '../types.js';
import type { FigColor, FigEffect, FigGuid, FigMessage, FigNodeChange, FigPaint } from './kiwi.js';

// ---------------------------------------------------------------------------
// Flat NodeChange list → openmake DocumentData tree.
// ---------------------------------------------------------------------------

/**
 * DoS guard: refuse to rebuild trees beyond this many node changes.
 * Untrusted browser input must fail with a single issue, never an OOM.
 */
export const MAX_NODE_CHANGES = 100_000;

/**
 * We cannot probe the host's installed font list from a pure parser, so only
 * the app's built-in default family counts as resolvable; every other family
 * is reported in `report.fontsMissing` (deduped).
 */
const RESOLVABLE_FONT_FAMILIES: ReadonlySet<string> = new Set(['Inter']);

const BLEND_MODES: ReadonlySet<string> = new Set([
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

const DEFAULT_PAGE_BACKGROUND: Color = { r: 0.96, g: 0.96, b: 0.96, a: 1 };

/**
 * Figma style-name tokens → CSS-style numeric weights. Checked in order, so
 * compound tokens ("SemiBold", "ExtraLight") must precede their substrings
 * ("Bold", "Light").
 */
const FONT_WEIGHT_TOKENS: ReadonlyArray<readonly [string, number]> = [
  ['thin', 100],
  ['extralight', 200],
  ['ultralight', 200],
  ['light', 300],
  ['regular', 400],
  ['normal', 400],
  ['book', 400],
  ['medium', 500],
  ['semibold', 600],
  ['demibold', 600],
  ['extrabold', 800],
  ['ultrabold', 800],
  ['bold', 700],
  ['black', 900],
  ['heavy', 900],
];

/**
 * Map a .fig fontName.style string (e.g. "Bold", "SemiBold Italic") to
 * fontWeight + fontStyle. Unknown tokens silently default to 400/NORMAL,
 * matching the silent-default handling of other font properties.
 */
function convertFontNameStyle(style: unknown): {
  fontWeight: number;
  fontStyle: TextStyle['fontStyle'];
} {
  const normalized = typeof style === 'string' ? style.toLowerCase().replace(/[\s_-]+/g, '') : '';
  const fontStyle: TextStyle['fontStyle'] = normalized.includes('italic') ? 'ITALIC' : 'NORMAL';
  for (const [token, weight] of FONT_WEIGHT_TOKENS) {
    if (normalized.includes(token)) return { fontWeight: weight, fontStyle };
  }
  return { fontWeight: 400, fontStyle };
}

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function guidKeyOf(guid: FigGuid | undefined): string | null {
  if (!guid || typeof guid.sessionID !== 'number' || typeof guid.localID !== 'number') return null;
  return `${guid.sessionID}:${guid.localID}`;
}

function toColor(color: FigColor | undefined, fallback: Color): Color {
  if (!color || typeof color !== 'object') return { ...fallback };
  return {
    r: clamp01(num(color.r, fallback.r)),
    g: clamp01(num(color.g, fallback.g)),
    b: clamp01(num(color.b, fallback.b)),
    a: clamp01(num(color.a, 1)),
  };
}

function makeSyntheticRoot(rootId: string): DocumentNode {
  return {
    id: rootId,
    name: 'Imported document',
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
}

// NOTE: deliberately duplicated from importer.ts's private buildDocument —
// that file belongs to the REST importer and is out of scope here, and the
// helper is small enough that sharing it is not worth the coupling. Keep the
// two in sync if the DocumentData envelope ever changes.
function buildFigDocument(rootId: string, nodes: Record<string, SceneNode>): DocumentData {
  return {
    schemaVersion: DOCUMENT_SCHEMA_VERSION,
    id: createId('doc'),
    name: nodes[rootId]?.name ?? 'Imported document',
    rootId,
    nodes,
    variables: {},
    variableModes: [{ id: 'default', name: 'Default' }],
    styles: {},
    assets: {},
  };
}

/** A valid, empty DocumentData plus the given issues — used on every failure path. */
export function emptyImportResult(issues: ImportIssue[]): ImportResult {
  const rootId = createId('node');
  const nodes: Record<string, SceneNode> = { [rootId]: makeSyntheticRoot(rootId) };
  return {
    document: buildFigDocument(rootId, nodes),
    report: { imported: 0, skipped: 0, issues, fontsMissing: [] },
  };
}

/**
 * Rebuild the flat `nodeChanges` list into an openmake document. Never
 * throws — malformed entries are skipped with issues.
 */
export function mapFigMessage(message: FigMessage): ImportResult {
  const issues: ImportIssue[] = [];
  const nodes: Record<string, SceneNode> = {};
  const fontsMissing: string[] = [];
  const seenFontFamilies = new Set<string>();
  const unknownBlendModes = new Set<string>();
  let imported = 0;
  let skipped = 0;

  const rootId = createId('node');
  // Single synthetic DOCUMENT root. The REST importer wraps Figma's DOCUMENT
  // inside a second synthetic DOCUMENT node (a quirk we deliberately do NOT
  // replicate): here the .fig DOCUMENT nodeChange is mapped directly onto
  // this one root, so the tree has exactly one DOCUMENT.
  const rootNode = makeSyntheticRoot(rootId);
  nodes[rootId] = rootNode;

  const changes = Array.isArray(message.nodeChanges) ? message.nodeChanges : [];

  if (changes.length > MAX_NODE_CHANGES) {
    issues.push({
      severity: 'error',
      code: 'too-many-nodes',
      message: `File contains ${changes.length} node changes; the importer caps at ${MAX_NODE_CHANGES}. Nothing was imported.`,
    });
    return {
      document: buildFigDocument(rootId, nodes),
      report: { imported: 0, skipped: 0, issues, fontsMissing: [] },
    };
  }
  if (changes.length === 0) {
    issues.push({
      severity: 'warning',
      code: 'no-node-changes',
      message: 'The file contains no node changes; the imported document is empty.',
    });
  }

  // -------------------------------------------------------------------------
  // Index the flat list: guid key → entry, parent key → ordered children.
  // -------------------------------------------------------------------------

  interface Entry {
    change: FigNodeChange;
    key: string;
    index: number;
  }

  const byKey = new Map<string, Entry>();
  changes.forEach((change, index) => {
    if (!change || typeof change !== 'object') {
      skipped++;
      issues.push({
        severity: 'warning',
        code: 'invalid-node-change',
        message: `Node change #${index} is not an object and was skipped.`,
      });
      return;
    }
    const key = guidKeyOf(change.guid);
    if (key === null) {
      skipped++;
      issues.push({
        severity: 'warning',
        code: 'invalid-node-change',
        message: `Node change #${index} has no valid guid and was skipped.`,
      });
      return;
    }
    if (byKey.has(key)) {
      skipped++;
      issues.push({
        severity: 'warning',
        code: 'duplicate-node-guid',
        message: `Duplicate node guid ${key}; the later entry was skipped.`,
      });
      return;
    }
    byKey.set(key, { change, key, index });
  });

  const childrenByParent = new Map<string, Entry[]>();
  for (const entry of byKey.values()) {
    const parentKey = guidKeyOf(entry.change.parentIndex?.guid);
    if (parentKey === null) continue;
    const siblings = childrenByParent.get(parentKey);
    if (siblings) siblings.push(entry);
    else childrenByParent.set(parentKey, [entry]);
  }
  for (const siblings of childrenByParent.values()) {
    // Figma sibling order is the lexicographic order of the fractional-index
    // position strings; original array order only breaks exact ties.
    siblings.sort((a, b) => {
      const pa = a.change.parentIndex?.position ?? '';
      const pb = b.change.parentIndex?.position ?? '';
      if (pa < pb) return -1;
      if (pa > pb) return 1;
      return a.index - b.index;
    });
  }

  // -------------------------------------------------------------------------
  // Issue + conversion helpers (close over issues/counters).
  // -------------------------------------------------------------------------

  function warn(code: string, message: string, nodePath?: string): void {
    issues.push(
      nodePath === undefined
        ? { severity: 'warning', code, message }
        : { severity: 'warning', code, message, nodePath },
    );
  }

  function mapBlendMode(value: string | undefined, nodePath: string): BlendMode {
    if (value === undefined || value === 'NORMAL') return 'NORMAL';
    if (BLEND_MODES.has(value)) return value as BlendMode;
    if (!unknownBlendModes.has(value)) {
      unknownBlendModes.add(value);
      issues.push({
        severity: 'info',
        code: 'blend-mode-not-imported',
        message: `Blend mode "${value}" has no openmake equivalent and was normalized to NORMAL.`,
        nodePath,
      });
    }
    return 'NORMAL';
  }

  interface BaseProps {
    name: string;
    visible: boolean;
    locked: boolean;
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
    opacity: number;
    blendMode: BlendMode;
  }

  function convertBase(change: FigNodeChange, nodePath: string): BaseProps {
    let x = 0;
    let y = 0;
    let rotation = 0;
    const t = change.transform;
    if (t && typeof t === 'object') {
      // .fig transforms are already parent-relative: translation lives in
      // m02/m12 and rotation in the 2x2 part.
      x = num(t.m02, 0);
      y = num(t.m12, 0);
      const m00 = num(t.m00, 1);
      const m01 = num(t.m01, 0);
      const m10 = num(t.m10, 0);
      const m11 = num(t.m11, 1);
      rotation = (Math.atan2(m10, m00) * 180) / Math.PI;
      // Only translation + pure rotation is representable; skew or
      // non-uniform/non-unit scale beyond float tolerance is approximated.
      const TOLERANCE = 1e-3;
      const clean =
        Math.abs(m00 - m11) <= TOLERANCE &&
        Math.abs(m01 + m10) <= TOLERANCE &&
        Math.abs(Math.hypot(m00, m10) - 1) <= TOLERANCE;
      if (!clean) {
        warn(
          'transform-approximated',
          'Node transform has skew or non-uniform scale; only translation and rotation were kept.',
          nodePath,
        );
      }
    }
    return {
      name: typeof change.name === 'string' ? change.name : 'Unnamed',
      visible: change.visible ?? true,
      locked: change.locked ?? false,
      x,
      y,
      width: Math.max(0, num(change.size?.x, 100)),
      height: Math.max(0, num(change.size?.y, 100)),
      rotation,
      opacity: clamp01(num(change.opacity, 1)),
      blendMode: mapBlendMode(change.blendMode, nodePath),
    };
  }

  function convertPaints(paints: FigPaint[] | undefined, nodePath: string): Paint[] {
    const out: Paint[] = [];
    if (!Array.isArray(paints)) return out;
    const warned = new Set<string>();
    const warnOnce = (code: string, message: string): void => {
      if (warned.has(code)) return;
      warned.add(code);
      warn(code, message, nodePath);
    };
    for (const paint of paints) {
      if (!paint || typeof paint !== 'object') continue;
      const type = paint.type;
      if (type === 'SOLID') {
        out.push({
          type: 'SOLID',
          // Preserve BOTH the color's alpha channel and the paint-level
          // opacity. (The REST importer flattens paint opacity to 1 — a bug
          // we deliberately do not copy.)
          color: toColor(paint.color, { r: 0, g: 0, b: 0, a: 1 }),
          opacity: clamp01(num(paint.opacity, 1)),
          visible: paint.visible ?? true,
        });
        continue;
      }
      if (typeof type === 'string' && type.startsWith('GRADIENT_')) {
        warnOnce(
          'gradient-not-imported',
          `Gradient paint "${type}" is not imported yet; it was dropped.`,
        );
        continue;
      }
      if (type === 'IMAGE') {
        warnOnce('image-not-imported', 'Image paints are not imported yet; the paint was dropped.');
        continue;
      }
      warnOnce(
        'paint-not-imported',
        `Paint type "${String(type)}" is not supported; it was dropped.`,
      );
    }
    return out;
  }

  function convertStrokes(change: FigNodeChange, nodePath: string): Stroke[] {
    const paints = convertPaints(change.strokePaints, nodePath);
    if (paints.length === 0) return [];
    const weight = Math.max(0, num(change.strokeWeight, 1));
    // Set align explicitly (the shared schema default is INSIDE, which also
    // matches Figma's default).
    const align: Stroke['align'] =
      change.strokeAlign === 'CENTER'
        ? 'CENTER'
        : change.strokeAlign === 'OUTSIDE'
          ? 'OUTSIDE'
          : 'INSIDE';
    const dashPattern = Array.isArray(change.dashPattern)
      ? change.dashPattern.filter(
          (d): d is number => typeof d === 'number' && Number.isFinite(d) && d >= 0,
        )
      : [];
    return paints.map((paint) => ({
      paint,
      weight,
      align,
      ...(dashPattern.length > 0 ? { dashPattern } : {}),
    }));
  }

  function convertEffects(effects: FigEffect[] | undefined, nodePath: string): Effect[] {
    const out: Effect[] = [];
    if (!Array.isArray(effects)) return out;
    let warnedDropped = false;
    for (const effect of effects) {
      if (!effect || typeof effect !== 'object') continue;
      const type = effect.type;
      if (type === 'DROP_SHADOW' || type === 'INNER_SHADOW') {
        out.push({
          type,
          color: toColor(effect.color, { r: 0, g: 0, b: 0, a: 0.25 }),
          offset: { x: num(effect.offset?.x, 0), y: num(effect.offset?.y, 0) },
          blur: Math.max(0, num(effect.radius, 0)),
          spread: num(effect.spread, 0),
          visible: effect.visible ?? true,
        });
        continue;
      }
      // Figma's internal name for layer blur is FOREGROUND_BLUR.
      if (type === 'LAYER_BLUR' || type === 'FOREGROUND_BLUR' || type === 'BACKGROUND_BLUR') {
        out.push({
          type: type === 'BACKGROUND_BLUR' ? 'BACKGROUND_BLUR' : 'LAYER_BLUR',
          radius: Math.max(0, num(effect.radius, 0)),
          visible: effect.visible ?? true,
        });
        continue;
      }
      if (!warnedDropped) {
        warnedDropped = true;
        warn(
          'effect-not-imported',
          `Effect type "${String(type)}" is not supported; it was dropped.`,
          nodePath,
        );
      }
    }
    return out;
  }

  function convertAutoLayout(change: FigNodeChange, nodePath: string): AutoLayout | undefined {
    const mode = change.stackMode;
    if (mode !== 'HORIZONTAL' && mode !== 'VERTICAL') return undefined;
    let approximated = false;
    const pickAlign = <T extends string>(value: string | undefined, allowed: readonly T[]): T => {
      const fallback = allowed[0] as T;
      if (value === undefined) return fallback;
      if ((allowed as readonly string[]).includes(value)) return value as T;
      approximated = true;
      return fallback;
    };
    const alignItems = pickAlign(change.stackCounterAlignItems, [
      'MIN',
      'CENTER',
      'MAX',
      'BASELINE',
    ] as const);
    const justifyContent = pickAlign(change.stackPrimaryAlignItems, [
      'MIN',
      'CENTER',
      'MAX',
      'SPACE_BETWEEN',
    ] as const);
    if (approximated) {
      warn(
        'auto-layout-approximated',
        'Some auto-layout alignment values have no openmake equivalent and were replaced with defaults.',
        nodePath,
      );
    }
    const hPad = num(change.stackHorizontalPadding, 0);
    const vPad = num(change.stackVerticalPadding, 0);
    return {
      mode,
      gap: num(change.stackSpacing ?? change.itemSpacing, 0),
      paddingTop: vPad,
      paddingLeft: hPad,
      paddingRight: num(change.stackPaddingRight, hPad),
      paddingBottom: num(change.stackPaddingBottom, vPad),
      alignItems,
      justifyContent,
      wrap: false,
    };
  }

  function convertTextStyle(change: FigNodeChange): TextStyle {
    const fontSize = Math.max(1, num(change.fontSize, 16));
    const fontFamily =
      typeof change.fontName?.family === 'string' ? change.fontName.family : 'Inter';
    if (!RESOLVABLE_FONT_FAMILIES.has(fontFamily) && !seenFontFamilies.has(fontFamily)) {
      seenFontFamilies.add(fontFamily);
      fontsMissing.push(fontFamily);
    }
    let letterSpacing = 0;
    const ls = change.letterSpacing;
    if (typeof ls === 'number') {
      letterSpacing = num(ls, 0);
    } else if (ls && typeof ls === 'object') {
      const value = num(ls.value, 0);
      letterSpacing = ls.units === 'PERCENT' ? (value / 100) * fontSize : value;
    }
    // Pixel line heights become a multiplier of fontSize; everything else
    // (percent, raw, absent) falls back to AUTO.
    let lineHeight: TextStyle['lineHeight'] = 'AUTO';
    const lh = change.lineHeight;
    if (lh && typeof lh === 'object' && lh.units === 'PIXELS') {
      const px = num(lh.value, 0);
      if (px > 0) lineHeight = px / fontSize;
    }
    const align = change.textAlignHorizontal;
    const textAlign: TextStyle['textAlign'] =
      align === 'CENTER' || align === 'RIGHT' ? align : align === 'JUSTIFIED' ? 'JUSTIFY' : 'LEFT';
    const { fontWeight, fontStyle } = convertFontNameStyle(change.fontName?.style);
    return {
      fontFamily,
      fontSize,
      fontWeight,
      fontStyle,
      lineHeight,
      letterSpacing,
      textAlign,
      textDecoration: 'NONE',
    };
  }

  function convertCornerRadius(change: FigNodeChange, nodePath: string): number {
    const base = Math.max(0, num(change.cornerRadius, 0));
    const perCorner = [
      change.rectangleTopLeftCornerRadius,
      change.rectangleTopRightCornerRadius,
      change.rectangleBottomLeftCornerRadius,
      change.rectangleBottomRightCornerRadius,
    ];
    if (!perCorner.some((c) => typeof c === 'number')) return base;
    const values = perCorner.map((c) => Math.max(0, num(c, base)));
    const first = values[0] ?? base;
    if (values.every((v) => v === first)) return first;
    warn(
      'corner-radii-approximated',
      'Per-corner radii are not supported; the maximum radius was applied to all corners.',
      nodePath,
    );
    return Math.max(...values);
  }

  interface Converted {
    node: SceneNode;
    traverseChildren: boolean;
  }

  function convertChange(change: FigNodeChange, nodePath: string): Converted | null {
    const type = change.type;
    const id = createId('node');

    if (type === 'CANVAS') {
      if (change.internalOnly === true) {
        skipped++;
        issues.push({
          severity: 'info',
          code: 'internal-canvas-skipped',
          message: 'An internal-only canvas (Figma bookkeeping page) was skipped.',
          nodePath,
        });
        return null;
      }
      const base = convertBase(change, nodePath);
      return {
        node: {
          id,
          name: base.name,
          type: 'PAGE',
          visible: base.visible,
          locked: base.locked,
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          rotation: 0,
          opacity: base.opacity,
          blendMode: base.blendMode,
          children: [],
          backgroundColor: toColor(change.backgroundColor, DEFAULT_PAGE_BACKGROUND),
        },
        traverseChildren: true,
      };
    }

    if (type === 'FRAME' || type === 'COMPONENT' || type === 'COMPONENT_SET') {
      const base = convertBase(change, nodePath);
      const autoLayout = convertAutoLayout(change, nodePath);
      const common = {
        id,
        ...base,
        fills: convertPaints(change.fillPaints, nodePath),
        strokes: convertStrokes(change, nodePath),
        effects: convertEffects(change.effects, nodePath),
        children: [] as string[],
        clipsContent: true,
        cornerRadius: convertCornerRadius(change, nodePath),
        ...(autoLayout ? { autoLayout } : {}),
      };
      const node: SceneNode =
        type === 'FRAME'
          ? { ...common, type: 'FRAME' }
          : type === 'COMPONENT'
            ? { ...common, type: 'COMPONENT', description: '' }
            : { ...common, type: 'COMPONENT_SET', description: '' };
      return { node, traverseChildren: true };
    }

    if (type === 'INSTANCE') {
      const base = convertBase(change, nodePath);
      warn(
        'instance-not-resolved',
        'Component instances are imported as empty frame placeholders; overrides and children are dropped.',
        nodePath,
      );
      // Emitting an INSTANCE node would create a dangling componentId, so a
      // placeholder FRAME with the correct size/transform is used instead.
      return {
        node: {
          id,
          ...base,
          type: 'FRAME',
          fills: [],
          strokes: [],
          effects: [],
          children: [],
          clipsContent: true,
          cornerRadius: convertCornerRadius(change, nodePath),
        },
        traverseChildren: false,
      };
    }

    if (type === 'GROUP') {
      const base = convertBase(change, nodePath);
      const hasStyles =
        (Array.isArray(change.fillPaints) && change.fillPaints.length > 0) ||
        (Array.isArray(change.strokePaints) && change.strokePaints.length > 0) ||
        (Array.isArray(change.effects) && change.effects.length > 0);
      if (hasStyles) {
        warn(
          'group-styles-dropped',
          'openmake groups carry children only; the group’s paints/effects were dropped.',
          nodePath,
        );
      }
      return {
        node: { id, ...base, type: 'GROUP', children: [] },
        traverseChildren: true,
      };
    }

    if (type === 'RECTANGLE' || type === 'ROUNDED_RECTANGLE') {
      const base = convertBase(change, nodePath);
      return {
        node: {
          id,
          ...base,
          type: 'RECTANGLE',
          fills: convertPaints(change.fillPaints, nodePath),
          strokes: convertStrokes(change, nodePath),
          effects: convertEffects(change.effects, nodePath),
          cornerRadius: convertCornerRadius(change, nodePath),
        },
        traverseChildren: false,
      };
    }

    if (type === 'ELLIPSE' || type === 'LINE') {
      const base = convertBase(change, nodePath);
      return {
        node: {
          id,
          ...base,
          type,
          fills: convertPaints(change.fillPaints, nodePath),
          strokes: convertStrokes(change, nodePath),
          effects: convertEffects(change.effects, nodePath),
        },
        traverseChildren: false,
      };
    }

    if (type === 'REGULAR_POLYGON') {
      const base = convertBase(change, nodePath);
      return {
        node: {
          id,
          ...base,
          type: 'POLYGON',
          fills: convertPaints(change.fillPaints, nodePath),
          strokes: convertStrokes(change, nodePath),
          effects: convertEffects(change.effects, nodePath),
          pointCount: Math.max(3, Math.round(num(change.count, 3))),
        },
        traverseChildren: false,
      };
    }

    if (type === 'STAR') {
      const base = convertBase(change, nodePath);
      return {
        node: {
          id,
          ...base,
          type: 'STAR',
          fills: convertPaints(change.fillPaints, nodePath),
          strokes: convertStrokes(change, nodePath),
          effects: convertEffects(change.effects, nodePath),
          pointCount: Math.max(3, Math.round(num(change.count, 5))),
          innerRadius: clamp01(num(change.starInnerScale, 0.38)),
        },
        traverseChildren: false,
      };
    }

    if (type === 'TEXT') {
      const base = convertBase(change, nodePath);
      return {
        node: {
          id,
          ...base,
          type: 'TEXT',
          fills: convertPaints(change.fillPaints, nodePath),
          strokes: convertStrokes(change, nodePath),
          effects: convertEffects(change.effects, nodePath),
          characters:
            typeof change.textData?.characters === 'string' ? change.textData.characters : '',
          textStyle: convertTextStyle(change),
          autoResize: 'WIDTH_AND_HEIGHT',
        },
        traverseChildren: false,
      };
    }

    if (type === 'VECTOR' || type === 'BOOLEAN_OPERATION') {
      const base = convertBase(change, nodePath);
      warn(
        type === 'VECTOR' ? 'vector-network-not-imported' : 'boolean-flattening-not-supported',
        type === 'VECTOR'
          ? 'Vector networks are not decoded yet; an empty vector with the correct bounds was imported.'
          : 'Boolean operations cannot be flattened yet; an empty vector with the correct bounds was imported.',
        nodePath,
      );
      return {
        node: {
          id,
          ...base,
          type: 'VECTOR',
          fills: convertPaints(change.fillPaints, nodePath),
          strokes: convertStrokes(change, nodePath),
          effects: convertEffects(change.effects, nodePath),
          path: '',
        },
        traverseChildren: false,
      };
    }

    skipped++;
    warn(
      'unsupported-node-type',
      `Node type "${String(type)}" is not supported yet and was skipped.`,
      nodePath,
    );
    return null;
  }

  // -------------------------------------------------------------------------
  // Tree rebuild: iterative DFS (a recursive walk could overflow the stack on
  // a pathologically deep file, and this parser must never throw).
  // -------------------------------------------------------------------------

  const visited = new Set<string>();

  interface StackItem {
    entry: Entry;
    parentId: string;
    path: string;
  }
  const stack: StackItem[] = [];

  function pushChildren(parentKey: string, parentId: string, path: string): void {
    const kids = childrenByParent.get(parentKey);
    if (!kids) return;
    // LIFO stack: push in reverse so children convert in sorted order.
    for (let i = kids.length - 1; i >= 0; i--) {
      const kid = kids[i];
      if (kid) stack.push({ entry: kid, parentId, path });
    }
  }

  function appendChild(parentId: string, childId: string): void {
    const parentNode = nodes[parentId];
    if (parentNode && 'children' in parentNode && Array.isArray(parentNode.children)) {
      parentNode.children.push(childId);
    }
  }

  function processStack(): void {
    for (let item = stack.pop(); item !== undefined; item = stack.pop()) {
      const { entry, parentId, path } = item;
      if (visited.has(entry.key)) continue; // guards against guid cycles
      visited.add(entry.key);
      const nodePath = `${path}/${entry.change.name ?? 'unnamed'}`;
      const converted = convertChange(entry.change, nodePath);
      if (converted === null) continue; // skipped; its whole subtree is dropped
      nodes[converted.node.id] = converted.node;
      imported++;
      appendChild(parentId, converted.node.id);
      if (converted.traverseChildren) pushChildren(entry.key, converted.node.id, nodePath);
    }
  }

  let docEntry: Entry | undefined;
  for (const entry of byKey.values()) {
    if (entry.change.type === 'DOCUMENT') {
      docEntry = entry;
      break;
    }
  }

  if (docEntry) {
    visited.add(docEntry.key);
    rootNode.name =
      typeof docEntry.change.name === 'string' ? docEntry.change.name : 'Imported document';
    rootNode.visible = docEntry.change.visible ?? true;
    rootNode.opacity = clamp01(num(docEntry.change.opacity, 1));
    imported++;
    pushChildren(docEntry.key, rootId, rootNode.name);
    processStack();
  } else if (byKey.size > 0) {
    warn(
      'missing-document-node',
      'No DOCUMENT node change found; top-level nodes were recovered as orphans.',
    );
  }

  // Orphan recovery: entries whose parent guid does not exist anywhere in the
  // file. (Unvisited entries whose parent DOES exist are dropped subtrees of
  // skipped/placeholder nodes and stay dropped.) Orphan canvases re-attach
  // under the document root; everything else goes under the first page.
  for (const entry of byKey.values()) {
    if (visited.has(entry.key)) continue;
    const parentKey = guidKeyOf(entry.change.parentIndex?.guid);
    if (parentKey !== null && byKey.has(parentKey)) continue;
    if (entry.change.type === 'DOCUMENT') {
      visited.add(entry.key); // extra DOCUMENTs cannot be re-rooted
      continue;
    }
    const name = typeof entry.change.name === 'string' ? entry.change.name : 'unnamed';
    const isCanvas = entry.change.type === 'CANVAS';
    const firstPageId = rootNode.children.find((childId) => nodes[childId]?.type === 'PAGE');
    const targetId = isCanvas ? rootId : firstPageId;
    if (targetId === undefined) {
      visited.add(entry.key);
      skipped++;
      warn(
        'orphan-node',
        `Orphan node "${name}" references a missing parent and no page exists to adopt it; it was dropped.`,
      );
      continue;
    }
    warn(
      'orphan-node',
      `Node "${name}" references a missing parent and was attached under ${isCanvas ? 'the document root' : 'the first page'}.`,
    );
    stack.push({ entry, parentId: targetId, path: '(orphans)' });
    processStack();
  }

  return {
    document: buildFigDocument(rootId, nodes),
    report: { imported, skipped, issues, fontsMissing },
  };
}
