import { useEffect, useRef, useState } from 'react';
import { createCanvasKitRenderer, type Renderer } from '@openmake/renderer';
import { getWorldBounds, hitTest, type OpenDoc } from '@openmake/core';
import { useToolStore } from '../../store/tool.js';
import { useSelectionStore } from '../../store/selection.js';
import { useCameraStore } from '../../store/camera.js';
import { screenToWorld, zoomByFactor, panBy, type Camera } from '../../canvas/camera.js';
import { RenderLoop } from '../../canvas/render-loop.js';
import { loadEditorFonts } from '../../canvas/fonts.js';
import { normalizeRect, marqueeHits, type Rect } from '../../canvas/marquee.js';
import { useCreateShapeGesture } from '../../hooks/useCreateShapeGesture.js';
import { useSelectGesture } from '../../hooks/useSelectGesture.js';
import { OverlayLayer } from './OverlayLayer.js';
import { TextEditorOverlay } from './TextEditorOverlay.js';

export interface CanvasProps {
  doc: OpenDoc;
  pageId: string;
  onCursorMoveWorld?: (world: { x: number; y: number }) => void;
}

export function Canvas({ doc, pageId, onCursorMoveWorld }: CanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const loopRef = useRef<RenderLoop | null>(null);
  const cameraRef = useRef<Camera>(useCameraStore.getState().camera);
  const [ready, setReady] = useState(false);

  const tool = useToolStore((s) => s.tool);
  const setTool = useToolStore((s) => s.setTool);
  const setCamera = useCameraStore((s) => s.setCamera);
  const selection = useSelectionStore((s) => s.selectedIds);

  const [marquee, setMarquee] = useState<Rect | null>(null);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [textEditorNodeId, setTextEditorNodeId] = useState<string | null>(null);

  const createShape = useCreateShapeGesture({ doc, pageId, cameraRef, onCreated: () => setTool('select') });
  const selectGesture = useSelectGesture({ doc, pageId, cameraRef });

  // --- Setup: renderer + fonts + rAF loop ------------------------------------
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
      const container = containerRef.current;
      const dpr = window.devicePixelRatio || 1;
      const width = container?.clientWidth ?? 800;
      const height = container?.clientHeight ?? 600;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      renderer.resize(width, height, dpr);

      loopRef.current = new RenderLoop(renderer, doc, () => pageId, () => cameraRef.current);
      setReady(true);
    })();

    return () => {
      disposed = true;
      loopRef.current?.dispose();
      loopRef.current = null;
      rendererRef.current?.dispose();
      rendererRef.current = null;
    };
    // doc/pageId identity changes (switching files/pages) intentionally rebuild the renderer+loop.
  }, [doc, pageId]);

  // --- Resize observer --------------------------------------------------------
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const observer = new ResizeObserver(() => {
      const renderer = rendererRef.current;
      if (!renderer) return;
      const dpr = window.devicePixelRatio || 1;
      const width = container.clientWidth;
      const height = container.clientHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      renderer.resize(width, height, dpr);
      loopRef.current?.markDirty();
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // --- Space-to-pan (temporary hand tool) ------------------------------------
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !spaceHeld) setSpaceHeld(true);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpaceHeld(false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [spaceHeld]);

  const isPanMode = tool === 'hand' || spaceHeld;

  // --- Wheel: scroll to pan, cmd/ctrl+wheel to zoom at cursor ----------------
  const onWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const rect = canvasRef.current!.getBoundingClientRect();
    const anchor = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    if (e.metaKey || e.ctrlKey) {
      const factor = Math.exp(-e.deltaY * 0.01);
      cameraRef.current = zoomByFactor(cameraRef.current, anchor, factor);
    } else {
      cameraRef.current = panBy(cameraRef.current, { x: -e.deltaX, y: -e.deltaY });
    }
    setCamera(cameraRef.current);
    loopRef.current?.markDirty();
  };

  const panDragRef = useRef<{ x: number; y: number } | null>(null);

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(e.pointerId);
    const rect = canvas.getBoundingClientRect();
    const screen = { x: e.clientX - rect.left, y: e.clientY - rect.top };

    if (isPanMode || e.button === 1) {
      panDragRef.current = { x: e.clientX, y: e.clientY };
      return;
    }

    if (tool === 'select') {
      const world = screenToWorld(cameraRef.current, screen);
      const hitId = hitTest(doc, pageId, world);
      selectGesture.onPointerDown(e, { world, hitId, screen, setMarquee });
      return;
    }

    if (tool === 'text') {
      const world = screenToWorld(cameraRef.current, screen);
      const id = createShape.createTextAt(world);
      setTextEditorNodeId(id);
      return;
    }

    // frame / rectangle / ellipse / line: draw-by-drag with live preview.
    createShape.onPointerDown(e, screen);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const screen = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    onCursorMoveWorld?.(screenToWorld(cameraRef.current, screen));

    if (panDragRef.current) {
      const dx = e.clientX - panDragRef.current.x;
      const dy = e.clientY - panDragRef.current.y;
      panDragRef.current = { x: e.clientX, y: e.clientY };
      cameraRef.current = panBy(cameraRef.current, { x: dx, y: dy });
      loopRef.current?.markDirty();
      return;
    }

    if (tool === 'select') {
      selectGesture.onPointerMove(e, { screen, setMarquee });
      return;
    }

    createShape.onPointerMove(e, screen);
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    canvasRef.current?.releasePointerCapture(e.pointerId);
    if (panDragRef.current) {
      panDragRef.current = null;
      setCamera(cameraRef.current);
      return;
    }
    if (tool === 'select') {
      selectGesture.onPointerUp(e, { setMarquee, marqueeHits: (rect, candidates) => marqueeHits(rect, candidates) });
      return;
    }
    createShape.onPointerUp(e);
    doc.commitUndoGroup();
  };

  const cursorClass = isPanMode
    ? panDragRef.current
      ? 'cursor-grabbing'
      : 'cursor-grab'
    : tool === 'select'
      ? 'cursor-default'
      : 'cursor-crosshair';

  return (
    <div ref={containerRef} className="relative flex-1 overflow-hidden bg-canvas-app" data-testid="canvas-container">
      <canvas
        ref={canvasRef}
        className={cursorClass}
        style={{ width: '100%', height: '100%', display: 'block' }}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        data-testid="canvas-surface"
      />
      {ready && (
        <OverlayLayer
          doc={doc}
          pageId={pageId}
          selection={selection}
          cameraRef={cameraRef}
          marquee={marquee}
          getWorldBounds={(id) => getWorldBounds(doc, id)}
        />
      )}
      {textEditorNodeId && (
        <TextEditorOverlay
          doc={doc}
          nodeId={textEditorNodeId}
          cameraRef={cameraRef}
          onCommit={() => setTextEditorNodeId(null)}
        />
      )}
    </div>
  );
}

export function normalizeToRect(a: { x: number; y: number }, b: { x: number; y: number }): Rect {
  return normalizeRect(a, b);
}
