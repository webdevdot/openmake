import type { DesignContext, SceneNode } from '@openmake/shared';
import type { GeneratedFile, Generator } from '../types.js';
import { toPascalCase } from '../naming.js';
import { computeBoxStyle, computeTextStyle } from '../style-model.js';
import { computeAbsolutePosition, computeFlexLayout } from '../layout-model.js';
import { isContainerNode, resolveAllTrees, type ResolvedTree } from '../tree.js';
import { cssKeyframesFor } from '../animation.js';

interface RenderState {
  rules: string[];
  counter: { n: number };
}

function nextClass(state: RenderState, hint: string): string {
  state.counter.n += 1;
  return `${hint}-${state.counter.n}`;
}

/**
 * If `node` carries an animation, append its `@keyframes` + `.<name>` rule to
 * the stylesheet and return the animation class to add to the element, so a
 * designed motion ships straight to the exported CSS. Returns `''` otherwise.
 */
function animationClass(state: RenderState, node: SceneNode, elementClass: string): string {
  if (!node.animation) return '';
  const animName = `${elementClass}-anim`;
  state.rules.push(cssKeyframesFor(animName, node.animation));
  return ` ${animName}`;
}

function cssBlock(className: string, css: Record<string, string>): string {
  const decls = Object.entries(css)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join('\n');
  return `.${className} {\n${decls}\n}`;
}

function renderNode(
  tree: ResolvedTree,
  node: SceneNode,
  indent: string,
  insideAutoLayout: boolean,
  state: RenderState,
): string {
  const pad = indent;

  if (node.type === 'TEXT') {
    const box = computeBoxStyle(node);
    const text = computeTextStyle(node);
    const css = { ...box.css, ...text.css };
    const className = nextClass(state, 'text');
    if (Object.keys(css).length > 0) state.rules.push(cssBlock(className, css));
    const tag = node.characters.includes('\n') ? 'p' : 'span';
    const anim = animationClass(state, node, className);
    return `${pad}<${tag} class="${className}${anim}">${escapeHtml(node.characters)}</${tag}>`;
  }

  if (node.type === 'ELLIPSE') {
    const box = computeBoxStyle(node);
    const className = nextClass(state, 'ellipse');
    state.rules.push(cssBlock(className, { 'border-radius': '9999px', ...box.css }));
    const anim = animationClass(state, node, className);
    return `${pad}<div class="${className}${anim}"></div>`;
  }

  if (node.type === 'RECTANGLE' || node.type === 'VECTOR') {
    const box = computeBoxStyle(node);
    const className = nextClass(state, node.type === 'RECTANGLE' ? 'rect' : 'vector');
    if (Object.keys(box.css).length > 0) state.rules.push(cssBlock(className, box.css));
    const anim = animationClass(state, node, className);
    return `${pad}<div class="${className}${anim}"></div>`;
  }

  if (isContainerNode(node)) {
    const box = computeBoxStyle(node);
    const autoLayout = 'autoLayout' in node ? node.autoLayout : undefined;
    const children = tree.getChildren(node.id);
    let css = { ...box.css };

    if (autoLayout) {
      const flex = computeFlexLayout(autoLayout);
      css = { ...css, ...flex.css };
    } else if (!insideAutoLayout) {
      css['position'] = 'relative';
    }

    const className = nextClass(state, 'container');
    if (Object.keys(css).length > 0) state.rules.push(cssBlock(className, css));
    const anim = animationClass(state, node, className);

    const childLines = children.map((child) => {
      if (autoLayout) return renderNode(tree, child, pad + '  ', true, state);
      const pos =
        'x' in child && 'y' in child
          ? computeAbsolutePosition(child.x, child.y, child.width, child.height)
          : undefined;
      const inner = renderNode(tree, child, pad + '    ', false, state);
      if (!pos) return inner;
      const wrapClass = nextClass(state, 'pos');
      state.rules.push(cssBlock(wrapClass, pos.css));
      return `${pad}  <div class="${wrapClass}">\n${inner}\n${pad}  </div>`;
    });

    if (children.length === 0) return `${pad}<div class="${className}${anim}"></div>`;
    return `${pad}<div class="${className}${anim}">\n${childLines.join('\n')}\n${pad}</div>`;
  }

  return `${pad}<div></div>`;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function generatePage(tree: ResolvedTree): GeneratedFile {
  const name = toPascalCase(tree.root.name);
  const state: RenderState = { rules: [], counter: { n: 0 } };
  const body = renderNode(tree, tree.root, '    ', false, state);
  const content = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${tree.root.name}</title>
    <style>
${state.rules.map((r) => r.replace(/^/gm, '      ')).join('\n')}
    </style>
  </head>
  <body>
${body}
  </body>
</html>
`;
  return { path: `${name}.html`, content };
}

export const htmlCssGenerator: Generator = {
  framework: 'HTML_CSS',
  generate(ctx: DesignContext): GeneratedFile[] {
    return resolveAllTrees(ctx).map(generatePage);
  },
};
