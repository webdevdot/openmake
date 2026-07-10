import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import {
  resolveSnap,
  type Bounds,
  type OpenDoc,
  type SnapCandidateBox,
  type SnapGuide,
} from '@openmake/core';
import { worldToScreen, type Camera } from '../../canvas/camera.js';
import {
  handlePositions,
  resizeBounds,
  boundsCenter,
  rotationAngle,
  snapAngle,
  type HandleId,
} from '../../canvas/handles.js';
import { SNAP_THRESHOLD_PX, toCandidate } from '../../canvas/snap-helpers.js';
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
  snapGuides: SnapGuide[];
  setSnapGuides: (guides: SnapGuide[]) => void;
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
  snapGuides,
  setSnapGuides,
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
  // Guard against a stale selection whose node no longer exists — e.g. after a
  // version restore removes it, or a collaborator deletes it out from under us.
  // Without this, getWorldBounds throws "Node does not exist" and crashes the
  // whole editor via the router error boundary. Mirrors the guard at line ~84.
  const singleBounds =
    singleSelectedId && doc.getNode(singleSelectedId) ? getWorldBounds(singleSelectedId) : null;

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
                  pageId,
                  singleSelectedId,
                  singleBounds,
                  handleId as HandleId,
                  camera,
                  e,
                  setSnapGuides,
                  getWorldBounds,
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
          onPointerDown={(e) => {
            e.stopPropagation();
            startRotateDrag(doc, singleSelectedId, singleBounds, camera, e);
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

      {snapGuides.map((guide, i) => {
        // axis 'x' → vertical line at world-x `position`, spanning y start→end.
        // axis 'y' → horizontal line at world-y `position`, spanning x start→end.
        const a =
          guide.axis === 'x'
            ? worldToScreen(camera, { x: guide.position, y: guide.start })
            : worldToScreen(camera, { x: guide.start, y: guide.position });
        const b =
          guide.axis === 'x'
            ? worldToScreen(camera, { x: guide.position, y: guide.end })
            : worldToScreen(camera, { x: guide.end, y: guide.position });
        return (
          <div
            key={`snap-guide-${i}`}
            data-testid={`snap-guide-${guide.axis}-${i}`}
            className="absolute"
            style={{
              left: Math.min(a.x, b.x),
              top: Math.min(a.y, b.y),
              width: guide.axis === 'x' ? 1 : Math.abs(b.x - a.x),
              height: guide.axis === 'x' ? Math.abs(b.y - a.y) : 1,
              backgroundColor: 'var(--color-snap-guide, #f24d99)',
            }}
          />
        );
      })}

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

/** Maps client (screen) coordinates to world space using the canvas origin. */
function makeToWorld(camera: Camera, downEvent: React.PointerEvent) {
  const canvasRect = (downEvent.target as HTMLElement)
    .closest('[data-testid="canvas-container"]')
    ?.getBoundingClientRect();
  const originX = canvasRect?.left ?? 0;
  const originY = canvasRect?.top ?? 0;
  return (clientX: number, clientY: number) => ({
    x: (clientX - originX) / camera.zoom + camera.x,
    y: (clientY - originY) / camera.zoom + camera.y,
  });
}

function startResizeDrag(
  doc: OpenDoc,
  pageId: string,
  nodeId: string,
  originalBounds: Bounds,
  handle: HandleId,
  camera: Camera,
  downEvent: React.PointerEvent,
  setSnapGuides: (guides: SnapGuide[]) => void,
  getWorldBounds: (id: string) => Bounds,
): void {
  const toWorld = makeToWorld(camera, downEvent);
  const startWorldPoint = toWorld(downEvent.clientX, downEvent.clientY);

  // Which axes this handle actually drives — the same edge logic resizeBounds
  // uses. Reading-1 axis gate: a resolveSnap adjustment is applied only on an
  // axis the handle moves, so an east drag never nudges the anchored left edge.
  const drivesX = handle === 'nw' || handle === 'w' || handle === 'sw' ||
    handle === 'ne' || handle === 'e' || handle === 'se';
  const drivesY = handle === 'nw' || handle === 'n' || handle === 'ne' ||
    handle === 'sw' || handle === 's' || handle === 'se';

  const onMove = (e: PointerEvent) => {
    const currentWorld = toWorld(e.clientX, e.clientY);
    const delta = { x: currentWorld.x - startWorldPoint.x, y: currentWorld.y - startWorldPoint.y };

    // Resize once to get the dragged-edge bounds, then snap that box against
    // siblings. resolveSnap returns a whole-box dx/dy; we keep it only on the
    // driven axes and re-resize from the dragged edge with the corrected delta.
    const dragged = resizeBounds(originalBounds, handle, delta, e.shiftKey);
    const statics: SnapCandidateBox[] = [];
    for (const id of doc.getChildrenIds(pageId)) {
      if (id === nodeId) continue;
      statics.push(toCandidate(getWorldBounds(id)));
    }
    const snap = resolveSnap(toCandidate(dragged), statics, {
      grid: 0,
      threshold: SNAP_THRESHOLD_PX / camera.zoom,
    });

    const dxSnap = drivesX ? snap.dx : 0;
    const dySnap = drivesY ? snap.dy : 0;
    const next = (dxSnap !== 0 || dySnap !== 0)
      ? resizeBounds(originalBounds, handle, { x: delta.x + dxSnap, y: delta.y + dySnap }, e.shiftKey)
      : dragged;
    doc.updateNode(nodeId, next as unknown as Record<string, unknown>);

    // Only draw guides for snaps we actually applied (drop cross-axis guides).
    setSnapGuides(
      snap.guides.filter((g) => (g.axis === 'x' ? drivesX : drivesY)),
    );
  };
  const onUp = () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    setSnapGuides([]);
    doc.commitUndoGroup();
  };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
}

/**
 * Rotate a node about its bounds center by dragging the rotate handle. The
 * starting pointer angle is treated as the node's current rotation, so grabbing
 * the handle never snaps the node; subsequent motion adds the swept delta.
 * Shift snaps to 15° increments.
 */
function startRotateDrag(
  doc: OpenDoc,
  nodeId: string,
  originalBounds: Bounds,
  camera: Camera,
  downEvent: React.PointerEvent,
): void {
  const toWorld = makeToWorld(camera, downEvent);
  const center = boundsCenter(originalBounds);
  const startRotation = doc.getNode(nodeId)?.rotation ?? 0;
  const startPoint = toWorld(downEvent.clientX, downEvent.clientY);
  const startAngle = rotationAngle(center, startPoint);

  const onMove = (e: PointerEvent) => {
    const currentPoint = toWorld(e.clientX, e.clientY);
    const currentAngle = rotationAngle(center, currentPoint);
    // Rotation snaps to 15° increments unconditionally (always-on detent);
    // Shift no longer toggles this.
    const next = snapAngle(startRotation + (currentAngle - startAngle), true);
    doc.updateNode(nodeId, { rotation: next });
  };
  const onUp = () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    doc.commitUndoGroup();
  };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
}
