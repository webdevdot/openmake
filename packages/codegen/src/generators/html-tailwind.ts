import type { DesignContext, SceneNode } from '@openmake/shared';
import type { GeneratedFile, Generator } from '../types.js';
import { toPascalCase } from '../naming.js';
import { computeBoxStyle, computeTextStyle } from '../style-model.js';
import { computeAbsolutePosition, computeFlexLayout } from '../layout-model.js';
import { isContainerNode, resolveAllTrees, type ResolvedTree } from '../tree.js';

function classAttr(classes: string[]): string {
  return classes.length > 0 ? ` class="${classes.join(' ')}"` : '';
}

function styleAttr(css: Record<string, string>): string {
  const entries = Object.entries(css);
  if (entries.length === 0) return '';
  return ` style="${entries.map(([k, v]) => `${k}: ${v}`).join('; ')}"`;
}

function renderNode(tree: ResolvedTree, node: SceneNode, indent: string, insideAutoLayout: boolean): string {
  const pad = indent;

  if (node.type === 'TEXT') {
    const box = computeBoxStyle(node);
    const text = computeTextStyle(node);
    const classes = [...box.tw, ...text.tw];
    const css = { ...box.css, ...text.css };
    const tag = node.characters.includes('\n') ? 'p' : 'span';
    return `${pad}<${tag}${classAttr(classes)}${styleAttr(css)}>${escapeHtml(node.characters)}</${tag}>`;
  }

  if (node.type === 'ELLIPSE') {
    const box = computeBoxStyle(node);
    return `${pad}<div${classAttr(['rounded-full', ...box.tw])}${styleAttr(box.css)}></div>`;
  }

  if (node.type === 'RECTANGLE' || node.type === 'VECTOR') {
    const box = computeBoxStyle(node);
    return `${pad}<div${classAttr(box.tw)}${styleAttr(box.css)}></div>`;
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
      if (autoLayout) return renderNode(tree, child, pad + '  ', true);
      const pos =
        'x' in child && 'y' in child ? computeAbsolutePosition(child.x, child.y, child.width, child.height) : undefined;
      const inner = renderNode(tree, child, pad + '    ', false);
      if (!pos) return inner;
      return `${pad}  <div${classAttr(pos.tw)}${styleAttr(pos.css)}>\n${inner}\n${pad}  </div>`;
    });

    if (children.length === 0) return `${pad}<div${classAttr(classes)}${styleAttr(css)}></div>`;
    return `${pad}<div${classAttr(classes)}${styleAttr(css)}>\n${childLines.join('\n')}\n${pad}</div>`;
  }

  return `${pad}<div></div>`;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function generatePage(tree: ResolvedTree): GeneratedFile {
  const name = toPascalCase(tree.root.name);
  const body = renderNode(tree, tree.root, '    ', false);
  const content = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${tree.root.name}</title>
    <script src="https://cdn.tailwindcss.com"></script>
  </head>
  <body>
${body}
  </body>
</html>
`;
  return { path: `${name}.html`, content };
}

export const htmlTailwindGenerator: Generator = {
  framework: 'HTML_TAILWIND',
  generate(ctx: DesignContext): GeneratedFile[] {
    return resolveAllTrees(ctx).map(generatePage);
  },
};
