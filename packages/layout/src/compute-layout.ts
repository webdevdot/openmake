import type { AutoLayout, SceneNode, TextNode } from '@openmake/shared';
import { getYoga } from './yoga.js';
import { defaultMeasureText, type MeasureText } from './text-measure.js';
import type { Node as YogaNode } from 'yoga-layout';
import type { LayoutPatch } from './types.js';

export type { LayoutPatch } from './types.js';

/** Read-only view over the scene graph that computeLayout walks. */
export type NodeReader = {
  getNode(id: string): SceneNode | undefined;
  getChildrenIds(id: string): string[];
};

export interface ComputeLayoutOptions {
  measureText?: MeasureText;
}

/**
 * Compute auto-layout results for the subtree rooted at `rootId`, recursing
 * into nested auto-layout frames. Returns patches only for nodes whose
 * geometry actually changed (position and/or size).
 *
 * `rootId` itself must be a frame-like node with `autoLayout` set; if it
 * isn't, an empty map is returned (nothing to lay out).
 */
export function computeLayout(
  reader: NodeReader,
  rootId: string,
  opts: ComputeLayoutOptions = {},
): Map<string, LayoutPatch> {
  const root = reader.getNode(rootId);
  const patches = new Map<string, LayoutPatch>();
  if (!root || !getAutoLayout(root)) return patches;

  const measureText = opts.measureText ?? defaultMeasureText;
  const yoga = getYoga();
  // Each auto-layout frame gets its own throwaway Yoga tree (root + direct
  // children); freeing the root recursively frees that tree's children too.
  const yogaRoots: YogaNode[] = [];

  try {
    // Deepest-first: find every auto-layout frame in the subtree so nested
    // HUG containers size from content before ancestors read their result.
    const autoLayoutFrameIds = collectAutoLayoutFrames(reader, rootId);

    for (const frameId of autoLayoutFrameIds) {
      const frame = reader.getNode(frameId);
      const autoLayout = frame && getAutoLayout(frame);
      if (!frame || !autoLayout) continue;
      yogaRoots.push(layoutOneFrame(reader, frame, autoLayout, yoga, measureText, patches));
    }
  } finally {
    for (const node of yogaRoots) node.freeRecursive();
  }

  return patches;
}

function getAutoLayout(node: SceneNode): AutoLayout | undefined {
  return 'autoLayout' in node ? node.autoLayout : undefined;
}

/** Depth-first post-order list of auto-layout frame ids within the subtree (root included, if applicable). */
function collectAutoLayoutFrames(reader: NodeReader, rootId: string): string[] {
  const order: string[] = [];
  const visit = (id: string) => {
    const node = reader.getNode(id);
    if (!node) return;
    for (const childId of reader.getChildrenIds(id)) visit(childId);
    if (getAutoLayout(node)) order.push(id);
  };
  visit(rootId);
  return order;
}

function layoutOneFrame(
  reader: NodeReader,
  frame: SceneNode,
  autoLayout: AutoLayout,
  yoga: ReturnType<typeof getYoga>,
  measureText: MeasureText,
  patches: Map<string, LayoutPatch>,
): YogaNode {
  const childIds = reader
    .getChildrenIds(frame.id)
    .filter((id) => reader.getNode(id)?.visible !== false);

  const yogaRoot = yoga.Node.create();
  configureContainer(yoga, yogaRoot, autoLayout);

  const hugWidth = frame.layoutSizingHorizontal === 'HUG';
  const hugHeight = frame.layoutSizingVertical === 'HUG';
  yogaRoot.setWidth(hugWidth ? 'auto' : frame.width);
  yogaRoot.setHeight(hugHeight ? 'auto' : frame.height);

  const childNodes: YogaNode[] = [];
  for (const childId of childIds) {
    const child = reader.getNode(childId);
    if (!child) continue;
    const yogaChild = yoga.Node.create();
    childNodes.push(yogaChild);
    configureChild(yoga, yogaChild, child, autoLayout.mode, measureText, patches);
    yogaRoot.insertChild(yogaChild, yogaRoot.getChildCount());
  }

  yogaRoot.calculateLayout(
    hugWidth ? undefined : frame.width,
    hugHeight ? undefined : frame.height,
  );

  if (hugWidth || hugHeight) {
    const layout = yogaRoot.getComputedLayout();
    const framePatch: LayoutPatch = {};
    if (hugWidth && layout.width !== frame.width) framePatch.width = layout.width;
    if (hugHeight && layout.height !== frame.height) framePatch.height = layout.height;
    if (framePatch.width !== undefined || framePatch.height !== undefined) {
      mergePatch(patches, frame.id, framePatch);
    }
  }

  for (let i = 0; i < childIds.length; i++) {
    const childId = childIds[i]!;
    const child = reader.getNode(childId)!;
    const yogaChild = childNodes[i]!;
    const layout = yogaChild.getComputedLayout();
    const patch: LayoutPatch = {};
    if (layout.left !== child.x) patch.x = layout.left;
    if (layout.top !== child.y) patch.y = layout.top;
    if (layout.width !== child.width) patch.width = layout.width;
    if (layout.height !== child.height) patch.height = layout.height;
    if (Object.keys(patch).length > 0) mergePatch(patches, childId, patch);
  }

  return yogaRoot;
}

function mergePatch(patches: Map<string, LayoutPatch>, id: string, patch: LayoutPatch): void {
  const existing = patches.get(id);
  patches.set(id, existing ? { ...existing, ...patch } : patch);
}

function configureContainer(
  yoga: ReturnType<typeof getYoga>,
  node: YogaNode,
  autoLayout: AutoLayout,
): void {
  node.setFlexDirection(
    autoLayout.mode === 'HORIZONTAL' ? yoga.FlexDirection.Row : yoga.FlexDirection.Column,
  );
  node.setFlexWrap(autoLayout.wrap ? yoga.Wrap.Wrap : yoga.Wrap.NoWrap);
  node.setGap(yoga.Gutter.All, autoLayout.gap);
  node.setPadding(yoga.Edge.Top, autoLayout.paddingTop);
  node.setPadding(yoga.Edge.Right, autoLayout.paddingRight);
  node.setPadding(yoga.Edge.Bottom, autoLayout.paddingBottom);
  node.setPadding(yoga.Edge.Left, autoLayout.paddingLeft);
  node.setAlignItems(alignToYoga(yoga, autoLayout.alignItems));
  node.setJustifyContent(justifyToYoga(yoga, autoLayout.justifyContent));
}

function alignToYoga(
  yoga: ReturnType<typeof getYoga>,
  align: 'MIN' | 'CENTER' | 'MAX' | 'BASELINE',
) {
  switch (align) {
    case 'MIN':
      return yoga.Align.FlexStart;
    case 'CENTER':
      return yoga.Align.Center;
    case 'MAX':
      return yoga.Align.FlexEnd;
    case 'BASELINE':
      return yoga.Align.Baseline;
  }
}

function justifyToYoga(
  yoga: ReturnType<typeof getYoga>,
  justify: 'MIN' | 'CENTER' | 'MAX' | 'SPACE_BETWEEN',
) {
  switch (justify) {
    case 'MIN':
      return yoga.Justify.FlexStart;
    case 'CENTER':
      return yoga.Justify.Center;
    case 'MAX':
      return yoga.Justify.FlexEnd;
    case 'SPACE_BETWEEN':
      return yoga.Justify.SpaceBetween;
  }
}

function configureChild(
  yoga: ReturnType<typeof getYoga>,
  yogaChild: YogaNode,
  child: SceneNode,
  parentMode: 'HORIZONTAL' | 'VERTICAL',
  measureText: MeasureText,
  patches: Map<string, LayoutPatch>,
): void {
  const sizingH = child.layoutSizingHorizontal ?? 'FIXED';
  const sizingV = child.layoutSizingVertical ?? 'FIXED';
  const isMainAxisHorizontal = parentMode === 'HORIZONTAL';
  const childHasAutoLayout = getAutoLayout(child) !== undefined;
  const childIsText = child.type === 'TEXT';
  // A nested auto-layout child was already laid out in an earlier (deeper)
  // pass; its own throwaway Yoga tree has no children here, so we must feed
  // its resolved size in as a fixed value rather than re-deriving it via
  // 'auto' (which would collapse to 0 since this tree has no grandchildren).
  const resolvedChildPatch = childHasAutoLayout ? patches.get(child.id) : undefined;
  const resolvedWidth = resolvedChildPatch?.width ?? child.width;
  const resolvedHeight = resolvedChildPatch?.height ?? child.height;

  // Main-axis sizing: FILL -> flexGrow; HUG text -> auto (content-based via
  // measureText); HUG container -> its already-resolved size; FIXED -> explicit.
  configureAxis(yoga, yogaChild, 'width', sizingH, resolvedWidth, isMainAxisHorizontal, childIsText, childHasAutoLayout);
  configureAxis(yoga, yogaChild, 'height', sizingV, resolvedHeight, !isMainAxisHorizontal, childIsText, childHasAutoLayout);

  // Cross-axis FILL means "stretch to fill the cross axis" via alignSelf.
  if (isMainAxisHorizontal && sizingV === 'FILL') {
    yogaChild.setAlignSelf(yoga.Align.Stretch);
  } else if (!isMainAxisHorizontal && sizingH === 'FILL') {
    yogaChild.setAlignSelf(yoga.Align.Stretch);
  }

  if (childIsText) {
    const textNode = child as TextNode;
    yogaChild.setMeasureFunc((width) => {
      const maxWidth = Number.isFinite(width) && width > 0 ? width : undefined;
      return measureText(textNode, maxWidth);
    });
  }
}

function configureAxis(
  yoga: ReturnType<typeof getYoga>,
  node: YogaNode,
  axis: 'width' | 'height',
  sizing: 'FIXED' | 'HUG' | 'FILL',
  fixedValue: number,
  isMainAxis: boolean,
  contentBased: boolean,
  alreadyResolved: boolean,
): void {
  const setter = axis === 'width' ? node.setWidth.bind(node) : node.setHeight.bind(node);

  if (sizing === 'FILL' && isMainAxis) {
    node.setFlexGrow(1);
    node.setFlexShrink(1);
    setter('auto');
    return;
  }

  // A nested auto-layout child already has its size resolved (see caller) —
  // feed it in as a fixed value even if its own sizing mode is HUG, since
  // this isolated Yoga tree has no grandchildren for 'auto' to measure.
  if (alreadyResolved) {
    setter(fixedValue);
    return;
  }

  if (sizing === 'HUG' || contentBased) {
    setter('auto');
    return;
  }

  setter(fixedValue);
}
