import { useEffect, useRef, useState } from 'react';
import { createCanvasKitRenderer, type Renderer } from '@openmake/renderer';
import '../../canvas/canvaskit-init.js';
import { getWorldBounds, hitTest, type OpenDoc, type SnapGuide } from '@openmake/core';
import { useToolStore } from '../../store/tool.js';
import { useSelectionStore } from '../../store/selection.js';
import { useCameraStore } from '../../store/camera.js';
import { useImageStore } from '../../store/images.js';
import { useAnimationStore } from '../../store/animation.js';
import { useVariablesStore, buildVariableColors } from '../../store/variables.js';
import { screenToWorld, zoomByFactor, panBy, type Camera } from '../../canvas/camera.js';
import { RenderLoop } from '../../canvas/render-loop.js';
import { loadEditorFonts } from '../../canvas/fonts.js';
import { normalizeRect, marqueeHits, type Rect } from '../../canvas/marquee.js';
import { useCreateShapeGesture } from '../../hooks/useCreateShapeGesture.js';
import { useCreateImage } from '../../hooks/useCreateImage.js';
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
  const [initError, setInitError] = useState<string | null>(null);

  const tool = useToolStore((s) => s.tool);
  const setTool = useToolStore((s) => s.setTool);
  const setCamera = useCameraStore((s) => s.setCamera);
  const selection = useSelectionStore((s) => s.selectedIds);

  const [marquee, setMarquee] = useState<Rect | null>(null);
  const [snapGuides, setSnapGuides] = useState<SnapGuide[]>([]);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [textEditorNodeId, setTextEditorNodeId] = useState<string | null>(null);
  const pendingTextRef = useRef<{ x: number; y: number } | null>(null);

  const createShape = useCreateShapeGesture({
    doc,
    pageId,
    cameraRef,
    onCreated: () => setTool('select'),
  });
  const selectGesture = useSelectGesture({ doc, pageId, cameraRef });
  const createImage = useCreateImage({ doc, pageId });

  // --- Setup: renderer + fonts + rAF loop ------------------------------------
  useEffect(() => {
    let disposed = false;
    const canvas = canvasRef.current;
    if (!canvas) return;

    void (async () => {
      try {
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
        // resize() owns the canvas buffer + WebGL surface recreation.
        renderer.resize(width, height, dpr);

        loopRef.current = new RenderLoop(
          renderer,
          doc,
          () => pageId,
          () => cameraRef.current,
          () => useImageStore.getState().images,
          {
            // Motion playback: transient, editor-local overrides — never touches the doc.
            advance: (now) => useAnimationStore.getState().advance(now),
            isActive: () => useAnimationStore.getState().playing !== null,
            getOverrides: () => useAnimationStore.getState().overrides,
          },
          // Variables v1: resolve COLOR variables for each collection's active
          // mode (editor view state) so bound solid fills render live.
          () => buildVariableColors(doc),
        );
        setReady(true);
      } catch (err) {
        console.error('Canvas renderer failed to initialize', err);
        if (!disposed) setInitError(err instanceof Error ? err.message : String(err));
      }
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
      // resize() owns the canvas buffer + WebGL surface recreation.
      renderer.resize(container.clientWidth, container.clientHeight, dpr);
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

  // --- Image tool: file picker → place at viewport center --------------------
  // The image tool is a one-shot action rather than a draw-by-drag gesture:
  // selecting it opens the OS file picker, places the picked image at natural
  // size centered in the current viewport, then snaps back to the select tool.
  const imagePickPendingRef = useRef(false);
  useEffect(() => {
    if (tool !== 'image' || imagePickPendingRef.current) return;
    imagePickPendingRef.current = true;
    const container = containerRef.current;
    const cam = cameraRef.current;
    const centerScreen = {
      x: (container?.clientWidth ?? 0) / 2,
      y: (container?.clientHeight ?? 0) / 2,
    };
    const worldCenter = screenToWorld(cam, centerScreen);
    void createImage(worldCenter)
      .then((id) => {
        if (id) useSelectionStore.getState().set([id]);
      })
      .finally(() => {
        imagePickPendingRef.current = false;
        setTool('select');
      });
  }, [tool, createImage, setTool]);

  const isPanMode = tool === 'hand' || spaceHeld;

  // --- External camera changes (zoom shortcuts, ZoomMenu) → live camera ref --
  // Canvas's own gestures write cameraRef first and mirror the same object into
  // the store, so the reference check makes this a no-op for internal updates.
  useEffect(() => {
    return useCameraStore.subscribe((state) => {
      if (state.camera !== cameraRef.current) {
        cameraRef.current = state.camera;
        loopRef.current?.markDirty();
      }
    });
  }, []);

  // --- Motion playback: kick the render loop when play/stop/override changes -
  // The RenderLoop self-schedules while a node is playing, but the first frame
  // after Play (and the snap-back after Stop) needs an external nudge.
  useEffect(() => {
    return useAnimationStore.subscribe(() => loopRef.current?.markDirty());
  }, []);

  // Switching a collection's active mode is editor view state (not a doc write),
  // so nudge the loop to re-resolve bound fills for the newly active mode.
  useEffect(() => {
    return useVariablesStore.subscribe(() => loopRef.current?.markDirty());
  }, []);

  // --- Wheel: scroll to pan, cmd/ctrl+wheel to zoom at cursor ----------------
  // Attached natively (not via React's onWheel): React delegates wheel through
  // a passive root listener, where preventDefault() is ignored and the browser
  // fights the canvas with page scroll/pinch-zoom.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
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
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [setCamera]);

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
      // Create on pointerUP (click completion): mounting + focusing the text
      // editor mid-click would let the click's trailing events blur it.
      pendingTextRef.current = screenToWorld(cameraRef.current, screen);
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
      // Mirror into the store on every tick (not just at pointerup), matching
      // the wheel handler. This closes a race where a keyboard zoom shortcut
      // fired mid-drag would read a stale pre-drag camera from the store and
      // clobber the in-flight pan when Canvas's store-subscribe effect snaps
      // cameraRef back to that stale value.
      setCamera(cameraRef.current);
      loopRef.current?.markDirty();
      return;
    }

    if (tool === 'select') {
      selectGesture.onPointerMove(e, { screen, setMarquee, setGuides: setSnapGuides });
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
    if (pendingTextRef.current) {
      const id = createShape.createTextAt(pendingTextRef.current);
      pendingTextRef.current = null;
      setTextEditorNodeId(id);
      setTool('select');
      doc.commitUndoGroup();
      return;
    }
    if (tool === 'select') {
      selectGesture.onPointerUp(e, {
        setMarquee,
        setGuides: setSnapGuides,
        marqueeHits: (rect, candidates) => marqueeHits(rect, candidates),
      });
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
    <div
      ref={containerRef}
      className="relative flex-1 overflow-hidden bg-canvas-app"
      data-testid="canvas-container"
    >
      {initError && (
        <div
          data-testid="canvas-init-error"
          className="absolute inset-x-0 top-0 z-20 bg-red-600 px-3 py-2 text-xs text-white"
        >
          Canvas failed to initialize: {initError}
        </div>
      )}
      <canvas
        ref={canvasRef}
        className={cursorClass}
        style={{ width: '100%', height: '100%', display: 'block' }}
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
          snapGuides={snapGuides}
          setSnapGuides={setSnapGuides}
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
