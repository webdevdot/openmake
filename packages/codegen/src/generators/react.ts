import type { DesignContext, SceneNode } from '@openmake/shared';
import type { GeneratedFile, Generator } from '../types.js';
import { toPascalCase } from '../naming.js';
import { computeBoxStyle, computeTextStyle } from '../style-model.js';
import { computeAbsolutePosition, computeFlexLayout } from '../layout-model.js';
import { isContainerNode, resolveAllTrees, type ResolvedTree } from '../tree.js';

function classAttr(classes: string[]): string {
  return classes.length > 0 ? ` className="${classes.join(' ')}"` : '';
}

function styleAttr(css: Record<string, string>): string {
  const entries = Object.entries(css);
  if (entries.length === 0) return '';
  const jsxStyle = entries.map(([k, v]) => `${toCamelCss(k)}: '${v}'`).join(', ');
  return ` style={{ ${jsxStyle} }}`;
}

function toCamelCss(prop: string): string {
  return prop.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

function renderNode(tree: ResolvedTree, node: SceneNode, indent: string, insideAutoLayout: boolean): string {
  const pad = indent;

  if (node.type === 'TEXT') {
    const box = computeBoxStyle(node);
    const text = computeTextStyle(node);
    const classes = [...box.tw, ...text.tw];
    const css = { ...box.css, ...text.css };
    const tag = node.characters.includes('\n') ? 'p' : 'span';
    return `${pad}<${tag}${classAttr(classes)}${styleAttr(css)}>${escapeJsx(node.characters)}</${tag}>`;
  }

  if (node.type === 'ELLIPSE') {
    const box = computeBoxStyle(node);
    const classes = ['rounded-full', ...box.tw];
    return `${pad}<div${classAttr(classes)}${styleAttr(box.css)} />`;
  }

  if (node.type === 'RECTANGLE') {
    const box = computeBoxStyle(node);
    return `${pad}<div${classAttr(box.tw)}${styleAttr(box.css)} />`;
  }

  if (node.type === 'VECTOR') {
    const box = computeBoxStyle(node);
    return `${pad}<div${classAttr(box.tw)}${styleAttr(box.css)} />`;
  }

  if (isContainerNode(node)) {
    const box = computeBoxStyle(node);
    const autoLayout = 'autoLayout' in node ? node.autoLayout : undefined;
    const children = tree.getChildren(node.id);
    const classes = [...box.tw];
    let css = { ...box.css };

    if (autoLayout) {
      const flex = computeFlexLayout(autoLayout);
      classes.push(...flex.tw);
      css = { ...css, ...flex.css };
    } else if (!insideAutoLayout) {
      classes.push('relative');
      css['position'] = 'relative';
    }

    const childLines = children.map((child) => {
      if (!autoLayout && !('x' in node)) return renderNode(tree, child, pad + '  ', false);
      if (autoLayout) return renderNode(tree, child, pad + '  ', true);
      const pos = 'x' in child && 'y' in child ? computeAbsolutePosition(child.x, child.y, child.width, child.height) : undefined;
      const inner = renderNode(tree, child, pad + '    ', false);
      if (!pos) return inner;
      // Wrap absolutely-positioned children so their own render stays position-agnostic.
      const childClasses = pos.tw;
      const childCss = pos.css;
      return `${pad}  <div${classAttr(childClasses)}${styleAttr(childCss)}>\n${inner}\n${pad}  </div>`;
    });

    if (children.length === 0) {
      return `${pad}<div${classAttr(classes)}${styleAttr(css)} />`;
    }

    return `${pad}<div${classAttr(classes)}${styleAttr(css)}>\n${childLines.join('\n')}\n${pad}</div>`;
  }

  return `${pad}<div />`;
}

function escapeJsx(text: string): string {
  return text.replace(/[{}]/g, (c) => (c === '{' ? '&#123;' : '&#125;'));
}

function generateComponent(tree: ResolvedTree): GeneratedFile {
  const name = toPascalCase(tree.root.name);
  const body = renderNode(tree, tree.root, '      ', false);
  const content = `export function ${name}() {
  return (
${body}
  );
}
`;
  return { path: `${name}.tsx`, content };
}

export const reactGenerator: Generator = {
  framework: 'REACT',
  generate(ctx: DesignContext): GeneratedFile[] {
    return resolveAllTrees(ctx).map(generateComponent);
  },
};
