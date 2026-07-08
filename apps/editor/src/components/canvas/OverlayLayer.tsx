import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { Bounds, OpenDoc } from '@openmake/core';
import { worldToScreen, type Camera } from '../../canvas/camera.js';
import { handlePositions, resizeBounds, type HandleId } from '../../canvas/handles.js';
import type { Rect } from '../../canvas/marquee.js';
import { useDocVersion } from '../../hooks/document.js';
import { presenceLabelColor } from '../../lib/presence-color.js';
import { usePresenceStore } from '../../store/presence.js';

export interface OverlayLayerProps {
  doc: OpenDoc;
  pageId: string;
  selection: string[];
  cameraRef: RefObject<Camera>;
  marquee: Rect | null;
  getWorldBounds: (id: string) => Bounds;
}

/**
 * DOM-absolutely-positioned overlay above the canvas: selection outline +
 * handles, marquee rect, and remote cursors/selection. Positions are
 * recomputed imperatively via direct style writes during gestures (see the
 * rAF-synced update below), reconciled by React on commit.
 */
export function OverlayLayer({
  doc,
  pageId,
  selection,
  cameraRef,
  marquee,
  getWorldBounds,
}: OverlayLayerProps) {
  useDocVersion(doc);
  const containerRef = useRef<HTMLDivElement>(null);
  const [, forceTick] = useState(0);
  const remoteCursors = usePresenceStore((s) => s.remoteStates);

  // Re-render overlay positions every animation frame while mounted, so
  // camera changes during pan/zoom (which bypass React state) still move
  // the DOM overlay in lockstep with the canvas.
  useEffect(() => {
    let raf: number;
    const tick = () => {
      forceTick((n) => (n + 1) % 1_000_000);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const camera = cameraRef.current;
  if (!camera) return null;

  const singleSelectedId = selection.length === 1 ? selection[0]! : null;
  const singleBounds = singleSelectedId ? getWorldBounds(singleSelectedId) : null;

  return (
    <div
      ref={containerRef}
      className="pointer-events-none absolute inset-0"
      data-testid="overlay-layer"
    >
      {selection.map((id) => {
        const node = doc.getNode(id);
        if (!node) return null;
        const bounds = getWorldBounds(id);
        const topLeft = worldToScreen(camera, { x: bounds.x, y: bounds.y });
        const bottomRight = worldToScreen(camera, {
          x: bounds.x + bounds.width,
          y: bounds.y + bounds.height,
        });
        return (
          <div
            key={id}
            data-testid={`selection-outline-${id}`}
            className="absolute border"
            style={{
              left: topLeft.x,
              top: topLeft.y,
              width: bottomRight.x - topLeft.x,
              height: bottomRight.y - topLeft.y,
              borderColor: 'var(--color-accent)',
              borderWidth: 1,
            }}
          />
        );
      })}

      {singleBounds &&
        singleSelectedId &&
        Object.entries(handlePositions(singleBounds)).map(([handleId, worldPos]) => {
          const screenPos = worldToScreen(camera, worldPos);
          return (
            <div
              key={handleId}
              data-testid={`resize-handle-${handleId}`}
              className="pointer-events-auto absolute h-2 w-2 border bg-white"
              style={{
                left: screenPos.x - 4,
                top: screenPos.y - 4,
                borderColor: 'var(--color-accent)',
                cursor: `${handleId}-resize`,
              }}
              onPointerDown={(e) => {
                e.stopPropagation();
                startResizeDrag(
                  doc,
                  singleSelectedId,
                  singleBounds,
                  handleId as HandleId,
                  camera,
                  e,
                );
              }}
            />
          );
        })}

      {singleBounds && singleSelectedId && (
        <div
          data-testid="rotate-handle"
          className="pointer-events-auto absolute h-2 w-2 rounded-full border bg-white"
          style={{
            left:
              worldToScreen(camera, {
                x: singleBounds.x + singleBounds.width / 2,
                y: singleBounds.y,
              }).x - 4,
            top:
              worldToScreen(camera, {
                x: singleBounds.x + singleBounds.width / 2,
                y: singleBounds.y,
              }).y - 20,
            borderColor: 'var(--color-accent)',
            cursor: 'grab',
          }}
        />
      )}

      {marquee && (
        <div
          data-testid="marquee-rect"
          className="absolute border"
          style={{
            left: marquee.x,
            top: marquee.y,
            width: marquee.width,
            height: marquee.height,
            borderColor: 'var(--color-accent)',
            backgroundColor: 'var(--color-accent-muted)',
          }}
        />
      )}

      {Object.entries(remoteCursors).map(([userId, state]) => {
        if (!state.cursor) return null;
        const screenPos = worldToScreen(camera, state.cursor);
        return (
          <div
            key={userId}
            data-testid={`remote-cursor-${userId}`}
            className="absolute flex items-center gap-1"
            style={{ left: screenPos.x, top: screenPos.y, color: state.color }}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill={state.color}>
              <path d="M1 1l6 13 2-5 5-2z" />
            </svg>
            <span
              className="rounded px-1 text-xs"
              style={{ backgroundColor: state.color, color: presenceLabelColor(state.color) }}
            >
              {state.name}
            </span>
          </div>
        );
      })}

      {pageId && null}
    </div>
  );
}

function startResizeDrag(
  doc: OpenDoc,
  nodeId: string,
  originalBounds: Bounds,
  handle: HandleId,
  camera: Camera,
  downEvent: React.PointerEvent,
): void {
  const startWorld = { x: downEvent.clientX, y: downEvent.clientY };
  const canvasRect = (downEvent.target as HTMLElement)
    .closest('[data-testid="canvas-container"]')
    ?.getBoundingClientRect();

  const toWorld = (clientX: number, clientY: number) => {
    const originX = canvasRect?.left ?? 0;
    const originY = canvasRect?.top ?? 0;
    return {
      x: (clientX - originX) / camera.zoom + camera.x,
      y: (clientY - originY) / camera.zoom + camera.y,
    };
  };

  const startWorldPoint = toWorld(startWorld.x, startWorld.y);

  const onMove = (e: PointerEvent) => {
    const currentWorld = toWorld(e.clientX, e.clientY);
    const delta = { x: currentWorld.x - startWorldPoint.x, y: currentWorld.y - startWorldPoint.y };
    const next = resizeBounds(originalBounds, handle, delta, e.shiftKey);
    doc.updateNode(nodeId, next as unknown as Record<string, unknown>);
  };
  const onUp = () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    doc.commitUndoGroup();
  };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
}
