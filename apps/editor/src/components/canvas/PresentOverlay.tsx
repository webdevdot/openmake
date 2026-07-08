import { useEffect, useRef, useState } from 'react';
import { createCanvasKitRenderer, buildRenderScene, type Renderer } from '@openmake/renderer';
import { getWorldBounds, hitTest, type OpenDoc } from '@openmake/core';
import { fitBounds } from '../../canvas/camera.js';
import { loadEditorFonts } from '../../canvas/fonts.js';

export interface PresentOverlayProps {
  doc: OpenDoc;
  pageId: string;
  startFrameId: string;
  onExit: () => void;
  /** assetId → decoded image bytes for IMAGE paints, owned by the editor. */
  images?: Record<string, Uint8Array>;
}

/** Breathing room between the presented frame and the viewport edges (px per side). */
const PRESENT_FIT_PADDING = 48;

/** Camera that fits the presented frame inside the viewport with a margin. */
function presentCamera(doc: OpenDoc, frameId: string, viewport: { width: number; height: number }) {
  return fitBounds(getWorldBounds(doc, frameId), viewport, PRESENT_FIT_PADDING);
}

/** Full-screen prototype presentation: renders a frame, hotspots navigate via reactions. */
export function PresentOverlay({ doc, pageId, startFrameId, onExit, images }: PresentOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const [currentFrameId, setCurrentFrameId] = useState(startFrameId);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onExit();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onExit]);

  useEffect(() => {
    let disposed = false;
    const canvas = canvasRef.current;
    if (!canvas) return;

    void (async () => {
      await loadEditorFonts();
      const renderer = await createCanvasKitRenderer({ canvas });
      if (disposed) {
        renderer.dispose();
        return;
      }
      rendererRef.current = renderer;
      render();
    })();

    return () => {
      disposed = true;
      rendererRef.current?.dispose();
      rendererRef.current = null;
    };
  }, []);

  const render = () => {
    const renderer = rendererRef.current;
    const canvas = canvasRef.current;
    if (!renderer || !canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const width = window.innerWidth;
    const height = window.innerHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    renderer.resize(width, height, dpr);
    const scene = buildRenderScene(doc, pageId, images);
    const camera = presentCamera(doc, currentFrameId, { width, height });
    renderer.render(scene, camera);
  };

  useEffect(() => {
    render();
  }, [currentFrameId]);

  const onClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const width = window.innerWidth;
    const height = window.innerHeight;
    const camera = presentCamera(doc, currentFrameId, { width, height });
    const rect = canvas.getBoundingClientRect();
    const screen = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const world = { x: screen.x / camera.zoom + camera.x, y: screen.y / camera.zoom + camera.y };
    const hitId = hitTest(doc, pageId, world);
    if (!hitId) return;

    let cur: string | undefined = hitId;
    while (cur) {
      const node = doc.getNode(cur);
      const reaction = node?.reactions?.find((r) => r.trigger === 'ON_CLICK');
      if (reaction?.action.type === 'NAVIGATE' && reaction.action.destinationId) {
        setCurrentFrameId(reaction.action.destinationId);
        return;
      }
      cur = doc.getParentId(cur);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black" data-testid="present-overlay">
      <canvas
        ref={canvasRef}
        style={{ width: '100vw', height: '100vh', display: 'block' }}
        onClick={onClick}
      />
      <button
        type="button"
        data-testid="present-exit-button"
        className="absolute right-4 top-4 rounded-md border border-app bg-floating-app px-3 py-1.5 text-xs font-medium text-zinc-100"
        onClick={onExit}
      >
        Exit (Esc)
      </button>
    </div>
  );
}
