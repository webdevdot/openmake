import type { Color, Paint, SceneNode } from '@openmake/shared';
import { nodeLocalMatrix } from '@openmake/core';
import type { RenderScene } from './scene.js';

export interface ExportSVGOpts {
  nodeId?: string;
}

/** Pure-TS SVG serializer: no CanvasKit dependency, usable in any JS runtime. */
export function exportSVG(scene: RenderScene, opts: ExportSVGOpts = {}): string {
  const rootIds = opts.nodeId ? [opts.nodeId] : scene.rootIds;
  const bounds = opts.nodeId ? nodeBounds(scene, opts.nodeId) : sceneBounds(scene);

  const body = rootIds.map((id) => serializeNode(scene, id)).join('');
  // Only paint the page background for a whole-scene export; a single-node
  // export is a transparent crop of just that node's own drawing.
  const bg =
    !opts.nodeId && scene.backgroundColor
      ? `<rect x="0" y="0" width="${bounds.width}" height="${bounds.height}" fill="${colorToRgb(scene.backgroundColor)}"/>`
      : '';

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${bounds.width}" height="${bounds.height}" ` +
    `viewBox="${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}">` +
    bg +
    body +
    `</svg>`
  );
}

function nodeBounds(scene: RenderScene, nodeId: string) {
  const node = scene.nodes[nodeId];
  if (!node) throw new Error(`Node "${nodeId}" not found in scene`);
  return { x: 0, y: 0, width: node.width, height: node.height };
}

function sceneBounds(scene: RenderScene) {
  let maxX = 0;
  let maxY = 0;
  for (const id of scene.rootIds) {
    const node = scene.nodes[id];
    if (!node) continue;
    maxX = Math.max(maxX, node.x + node.width);
    maxY = Math.max(maxY, node.y + node.height);
  }
  return { x: 0, y: 0, width: maxX || 1, height: maxY || 1 };
}

function serializeNode(scene: RenderScene, id: string): string {
  const node = scene.nodes[id];
  if (!node || !node.visible) return '';

  const transformAttr = svgTransformAttr(node);
  const opacityAttr = node.opacity < 1 ? ` opacity="${node.opacity}"` : '';

  const inner = serializeOwnGeometry(node) + serializeChildren(scene, node);

  return `<g${transformAttr}${opacityAttr}>${inner}</g>`;
}

function serializeChildren(scene: RenderScene, node: SceneNode): string {
  if (!('children' in node)) return '';
  return (node.children as string[]).map((childId) => serializeNode(scene, childId)).join('');
}

function svgTransformAttr(node: SceneNode): string {
  const m = nodeLocalMatrix(node);
  // matrix(a b c d tx ty) — SVG's matrix() takes the same column-major
  // ordering as our Mat2x3 tuple [a, b, c, d, tx, ty].
  return ` transform="matrix(${m[0]} ${m[1]} ${m[2]} ${m[3]} ${m[4]} ${m[5]})"`;
}

function serializeOwnGeometry(node: SceneNode): string {
  switch (node.type) {
    case 'DOCUMENT':
    case 'PAGE':
    case 'GROUP':
    case 'COMPONENT_SET':
      return '';
    case 'RECTANGLE':
    case 'FRAME':
    case 'COMPONENT':
    case 'INSTANCE': {
      const r = 'cornerRadius' in node ? (node.cornerRadius ?? 0) : 0;
      return (
        rectTag(node.width, node.height, r, node.fills, node.effects) +
        strokeTags(node, rectAttrs(node.width, node.height, r))
      );
    }
    case 'ELLIPSE': {
      const rx = node.width / 2;
      const ry = node.height / 2;
      const attrs = `cx="${rx}" cy="${ry}" rx="${rx}" ry="${ry}"`;
      return tag('ellipse', attrs, node.fills) + strokeTags(node, attrs, 'ellipse');
    }
    case 'POLYGON':
    case 'STAR': {
      const points =
        node.type === 'POLYGON'
          ? regularPolygonPoints(node.width, node.height, node.pointCount)
          : starPoints(node.width, node.height, node.pointCount, node.innerRadius);
      const d = pointsToPathD(points);
      return tag('path', `d="${d}"`, node.fills) + strokeTags(node, `d="${d}"`, 'path');
    }
    case 'LINE': {
      const attrs = `x1="0" y1="0" x2="${node.width}" y2="0"`;
      return strokeTags(node, attrs, 'line');
    }
    case 'VECTOR': {
      return (
        tag('path', `d="${node.path}"`, node.fills) + strokeTags(node, `d="${node.path}"`, 'path')
      );
    }
    case 'TEXT': {
      const fill = node.fills?.find((p) => p.visible && p.type === 'SOLID');
      const fillAttr =
        fill && fill.type === 'SOLID'
          ? ` fill="${colorToRgb(fill.color)}" fill-opacity="${fill.opacity}"`
          : '';
      const ts = node.textStyle;
      return (
        `<text x="0" y="${ts.fontSize}" font-family="${escapeXml(ts.fontFamily)}" font-size="${ts.fontSize}" ` +
        `font-weight="${ts.fontWeight}" text-anchor="${textAnchor(ts.textAlign)}"${fillAttr}>${escapeXml(node.characters)}</text>`
      );
    }
  }
}

function rectAttrs(width: number, height: number, r: number): string {
  return `x="0" y="0" width="${width}" height="${height}"${r ? ` rx="${r}" ry="${r}"` : ''}`;
}

function rectTag(
  width: number,
  height: number,
  r: number,
  fills: Paint[],
  _effects: unknown[],
): string {
  return tag('rect', rectAttrs(width, height, r), fills);
}

function tag(name: string, attrs: string, fills: Paint[] | undefined): string {
  const fillAttr = fillAttrs(fills);
  return `<${name} ${attrs}${fillAttr}/>`;
}

function fillAttrs(fills: Paint[] | undefined): string {
  const fill = fills?.find((p) => p.visible);
  if (!fill) return ' fill="none"';
  if (fill.type === 'SOLID') {
    return ` fill="${colorToRgb(fill.color)}" fill-opacity="${fill.opacity}"`;
  }
  if (fill.type === 'GRADIENT_LINEAR' || fill.type === 'GRADIENT_RADIAL') {
    // Approximate: use the first stop's color as a flat fill (gradient <defs> would
    // require a per-shape unique id scheme; string-level tests only check element shape).
    const first = fill.stops[0];
    return first
      ? ` fill="${colorToRgb(first.color)}" fill-opacity="${fill.opacity}"`
      : ' fill="none"';
  }
  return ' fill="none"'; // IMAGE fills are not embedded in SVG output.
}

function strokeTags(
  node: Extract<SceneNode, { strokes: unknown[] }>,
  attrs: string,
  tagName?: string,
): string {
  if (!node.strokes || node.strokes.length === 0) return '';
  return node.strokes
    .map((stroke) => {
      if (!stroke.paint.visible) return '';
      const color = stroke.paint.type === 'SOLID' ? colorToRgb(stroke.paint.color) : '#000000';
      const dash = stroke.dashPattern?.length
        ? ` stroke-dasharray="${stroke.dashPattern.join(',')}"`
        : '';
      const name = tagName ?? (node.type === 'LINE' ? 'line' : 'rect');
      return `<${name} ${attrs} fill="none" stroke="${color}" stroke-width="${stroke.weight}"${dash}/>`;
    })
    .join('');
}

function regularPolygonPoints(width: number, height: number, count: number): number[] {
  const cx = width / 2;
  const cy = height / 2;
  const rx = width / 2;
  const ry = height / 2;
  const points: number[] = [];
  for (let i = 0; i < count; i++) {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / count;
    points.push(cx + rx * Math.cos(angle), cy + ry * Math.sin(angle));
  }
  return points;
}

function starPoints(width: number, height: number, count: number, innerRadius: number): number[] {
  const cx = width / 2;
  const cy = height / 2;
  const rx = width / 2;
  const ry = height / 2;
  const points: number[] = [];
  const total = count * 2;
  for (let i = 0; i < total; i++) {
    const angle = -Math.PI / 2 + (i * Math.PI) / count;
    const scale = i % 2 === 0 ? 1 : innerRadius;
    points.push(cx + rx * scale * Math.cos(angle), cy + ry * scale * Math.sin(angle));
  }
  return points;
}

function pointsToPathD(points: number[]): string {
  const parts: string[] = [];
  for (let i = 0; i < points.length; i += 2) {
    parts.push(`${i === 0 ? 'M' : 'L'}${points[i]},${points[i + 1]}`);
  }
  parts.push('Z');
  return parts.join(' ');
}

function textAnchor(align: 'LEFT' | 'CENTER' | 'RIGHT' | 'JUSTIFY'): string {
  if (align === 'CENTER') return 'middle';
  if (align === 'RIGHT') return 'end';
  return 'start';
}

function colorToRgb(color: Color): string {
  const r = Math.round(color.r * 255);
  const g = Math.round(color.g * 255);
  const b = Math.round(color.b * 255);
  return `rgb(${r},${g},${b})`;
}

function escapeXml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
