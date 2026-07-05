import { SceneNodeSchema, type DesignContext, type SceneNode } from '@openmake/shared';

function node(input: Record<string, unknown>): SceneNode {
  return SceneNodeSchema.parse(input);
}

function contextFor(root: SceneNode, descendants: SceneNode[] = []): DesignContext {
  const descendantsById: Record<string, SceneNode> = {};
  const childrenOrder: Record<string, string[]> = {};

  const all = [root, ...descendants];
  for (const n of all) {
    if ('children' in n) childrenOrder[n.id] = n.children;
  }
  for (const d of descendants) descendantsById[d.id] = d;

  return {
    document: { id: 'doc_1', name: 'Fixture doc' },
    selection: [
      {
        node: root,
        path: [],
        descendants: descendantsById,
        childrenOrder,
        ...(root.type === 'COMPONENT'
          ? { component: { id: root.id, name: root.name, description: '' } }
          : {}),
      },
    ],
    variables: {},
    styles: {},
  };
}

/** Auto-layout row frame with gap + padding + two rectangle children. */
export function autoLayoutRowFixture(): DesignContext {
  const child1 = node({
    id: 'rect_1',
    type: 'RECTANGLE',
    name: 'Rect 1',
    width: 40,
    height: 40,
    fills: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0, a: 1 }, opacity: 1, visible: true }],
  });
  const child2 = node({
    id: 'rect_2',
    type: 'RECTANGLE',
    name: 'Rect 2',
    width: 40,
    height: 40,
  });
  const root = node({
    id: 'frame_row',
    type: 'FRAME',
    name: 'Auto Layout Row',
    width: 200,
    height: 80,
    children: ['rect_1', 'rect_2'],
    autoLayout: {
      mode: 'HORIZONTAL',
      gap: 12,
      paddingTop: 16,
      paddingRight: 16,
      paddingBottom: 16,
      paddingLeft: 16,
      alignItems: 'CENTER',
      justifyContent: 'SPACE_BETWEEN',
      wrap: false,
    },
  });
  return contextFor(root, [child1, child2]);
}

/** Non-auto-layout frame with an absolutely positioned child. */
export function absolutePositionFixture(): DesignContext {
  const child = node({
    id: 'rect_abs',
    type: 'RECTANGLE',
    name: 'Absolute Rect',
    x: 30,
    y: 50,
    width: 100,
    height: 60,
  });
  const root = node({
    id: 'frame_free',
    type: 'FRAME',
    name: 'Freeform Frame',
    width: 300,
    height: 300,
    children: ['rect_abs'],
  });
  return contextFor(root, [child]);
}

/** TEXT node with rich text styling. */
export function textStylingFixture(): DesignContext {
  const root = node({
    id: 'text_1',
    type: 'TEXT',
    name: 'Heading',
    characters: 'Hello openmake',
    width: 200,
    height: 40,
    fills: [{ type: 'SOLID', color: { r: 0.1, g: 0.1, b: 0.1, a: 1 }, opacity: 1, visible: true }],
    textStyle: {
      fontFamily: 'Inter',
      fontSize: 24,
      fontWeight: 700,
      fontStyle: 'NORMAL',
      lineHeight: 32,
      letterSpacing: 0,
      textAlign: 'CENTER',
      textDecoration: 'NONE',
    },
  });
  return contextFor(root);
}

/** Frame with a corner radius. */
export function cornerRadiusFixture(): DesignContext {
  const root = node({
    id: 'rect_rounded',
    type: 'RECTANGLE',
    name: 'Rounded Rect',
    width: 100,
    height: 100,
    cornerRadius: 12,
    fills: [{ type: 'SOLID', color: { r: 0, g: 0, b: 1, a: 1 }, opacity: 1, visible: true }],
  });
  return contextFor(root);
}

/** Component whose name requires PascalCase sanitization. */
export function pascalCaseNamingFixture(): DesignContext {
  const root = node({
    id: 'comp_1',
    type: 'COMPONENT',
    name: '2 primary button (large)',
    width: 120,
    height: 40,
    children: [],
    description: '',
  });
  return contextFor(root);
}

/** Frame with a linear gradient fill. */
export function gradientFixture(): DesignContext {
  const root = node({
    id: 'rect_gradient',
    type: 'RECTANGLE',
    name: 'Gradient Rect',
    width: 100,
    height: 100,
    fills: [
      {
        type: 'GRADIENT_LINEAR',
        from: { x: 0, y: 0 },
        to: { x: 1, y: 0 },
        stops: [
          { position: 0, color: { r: 1, g: 0, b: 0, a: 1 } },
          { position: 1, color: { r: 0, g: 0, b: 1, a: 1 } },
        ],
        opacity: 1,
        visible: true,
      },
    ],
  });
  return contextFor(root);
}
