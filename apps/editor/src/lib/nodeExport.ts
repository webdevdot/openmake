import type { OpenDoc } from '@openmake/core';
import { createCanvasKitRenderer, buildRenderScene, exportSVG } from '@openmake/renderer';
import { useImageStore } from '../store/images.js';
import { buildVariableColors } from '../store/variables.js';
import { downloadBytes, downloadText } from './export.js';

/**
 * Render a single node on `pageId` to a PNG and trigger a download. Shared by
 * the TopBar / inspector export buttons (via EditorPage) and the Tools panel so
 * every "Export PNG" surface routes through the same renderer path.
 */
export async function exportNodePNG(
  doc: OpenDoc,
  pageId: string,
  nodeId: string,
  scale: 1 | 2,
): Promise<void> {
  const renderer = await createCanvasKitRenderer({ surface: 'offscreen' });
  try {
    // Overrides stay empty for exports (no playback pose); bound variable
    // colors resolve for the active mode so exports match the canvas.
    const scene = buildRenderScene(
      doc,
      pageId,
      useImageStore.getState().images,
      {},
      buildVariableColors(doc),
    );
    const bytes = await renderer.exportPNG(scene, { nodeId, scale });
    downloadBytes(bytes, `${doc.getNode(nodeId)?.name ?? 'export'}.png`, 'image/png');
  } finally {
    renderer.dispose();
  }
}

/**
 * Serialize a single node on `pageId` to SVG and trigger a download. Shared by
 * the TopBar / inspector export buttons (via EditorPage) and the Tools panel.
 */
export function exportNodeSVG(doc: OpenDoc, pageId: string, nodeId: string): void {
  const scene = buildRenderScene(
    doc,
    pageId,
    useImageStore.getState().images,
    {},
    buildVariableColors(doc),
  );
  const svg = exportSVG(scene, { nodeId });
  downloadText(svg, `${doc.getNode(nodeId)?.name ?? 'export'}.svg`, 'image/svg+xml');
}
