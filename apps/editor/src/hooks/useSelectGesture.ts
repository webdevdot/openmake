import { useRef } from 'react';
import type { RefObject } from 'react';
import { getWorldBounds, type OpenDoc } from '@openmake/core';
import { useSelectionStore } from '../store/selection.js';
import { screenToWorld, type Camera } from '../canvas/camera.js';
import { normalizeRect, type Rect } from '../canvas/marquee.js';

interface DownArgs {
  world: { x: number; y: number };
  hitId: string | null;
  screen: { x: number; y: number };
  setMarquee: (rect: Rect | null) => void;
}

interface MoveArgs {
  screen: { x: number; y: number };
  setMarquee: (rect: Rect | null) => void;
}

interface UpArgs {
  setMarquee: (rect: Rect | null) => void;
  marqueeHits: (rect: Rect, candidates: Array<{ id: string; bounds: Rect }>) => string[];
}

/**
 * Click-to-select, shift-add, marquee-drag-to-select, and drag-to-move for
 * the select tool. Drag-move writes directly to the document (no React
 * state) and marks the render loop dirty via the doc's own subscribe.
 */
export function useSelectGesture({
  doc,
  pageId,
  cameraRef,
}: {
  doc: OpenDoc;
  pageId: string;
  cameraRef: RefObject<Camera>;
}) {
  const dragStartScreen = useRef<{ x: number; y: number } | null>(null);
  const dragStartWorld = useRef<{ x: number; y: number } | null>(null);
  const mode = useRef<'idle' | 'marquee' | 'move'>('idle');
  const moveOrigins = useRef<Map<string, { x: number; y: number }>>(new Map());
  const shiftAxisLock = useRef<'x' | 'y' | null>(null);
  const marqueeRectRef = useRef<Rect | null>(null);

  const onPointerDown = (e: React.PointerEvent, { world, hitId, screen, setMarquee }: DownArgs) => {
    const { selectedIds, set, toggle, clear } = useSelectionStore.getState();
    dragStartScreen.current = screen;
    dragStartWorld.current = world;
    shiftAxisLock.current = null;

    if (hitId) {
      if (e.shiftKey) {
        toggle(hitId);
      } else if (!selectedIds.includes(hitId)) {
        set([hitId]);
      }
      mode.current = 'move';
      moveOrigins.current.clear();
      const ids = useSelectionStore.getState().selectedIds;
      for (const id of ids) {
        const node = doc.getNode(id);
        if (node) moveOrigins.current.set(id, { x: node.x, y: node.y });
      }
    } else {
      if (!e.shiftKey) clear();
      mode.current = 'marquee';
      const rect = { x: screen.x, y: screen.y, width: 0, height: 0 };
      marqueeRectRef.current = rect;
      setMarquee(rect);
    }
  };

  const onPointerMove = (e: React.PointerEvent, { screen, setMarquee }: MoveArgs) => {
    if (mode.current === 'marquee' && dragStartScreen.current) {
      const rect = normalizeRect(dragStartScreen.current, screen);
      marqueeRectRef.current = rect;
      setMarquee(rect);
      return;
    }
    if (mode.current === 'move' && dragStartWorld.current && cameraRef.current) {
      const world = screenToWorld(cameraRef.current, screen);
      let dx = world.x - dragStartWorld.current.x;
      let dy = world.y - dragStartWorld.current.y;
      if (e.shiftKey) {
        if (!shiftAxisLock.current) {
          shiftAxisLock.current = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
        }
        if (shiftAxisLock.current === 'x') dy = 0;
        else dx = 0;
      } else {
        shiftAxisLock.current = null;
      }
      doc.transact(() => {
        for (const [id, origin] of moveOrigins.current) {
          doc.updateNode(id, { x: origin.x + dx, y: origin.y + dy });
        }
      });
    }
  };

  const onPointerUp = (_e: React.PointerEvent, { setMarquee, marqueeHits }: UpArgs) => {
    if (mode.current === 'marquee' && dragStartScreen.current) {
      const camera = cameraRef.current;
      const candidates = doc
        .getChildrenIds(pageId)
        .flatMap(function collect(id): Array<{ id: string; bounds: Rect }> {
          const node = doc.getNode(id);
          if (!node) return [];
          const self = [{ id, bounds: getWorldBounds(doc, id) }];
          const children = 'children' in node ? (node.children as string[]) : [];
          return self.concat(children.flatMap(collect));
        });
      // The marquee rect in state is screen-space; convert it to world-space
      // (via the marquee corners) so it can be compared against candidate
      // world bounds without per-candidate camera math.
      const current = marqueeRectRef.current;
      if (current && camera) {
        const worldTopLeft = screenToWorld(camera, { x: current.x, y: current.y });
        const worldBottomRight = screenToWorld(camera, {
          x: current.x + current.width,
          y: current.y + current.height,
        });
        const worldRect: Rect = {
          x: worldTopLeft.x,
          y: worldTopLeft.y,
          width: worldBottomRight.x - worldTopLeft.x,
          height: worldBottomRight.y - worldTopLeft.y,
        };
        const hits = marqueeHits(worldRect, candidates);
        useSelectionStore.getState().set(hits);
      }
      marqueeRectRef.current = null;
      setMarquee(null);
    }
    if (mode.current === 'move') {
      doc.commitUndoGroup();
    }
    mode.current = 'idle';
    dragStartScreen.current = null;
    dragStartWorld.current = null;
    moveOrigins.current.clear();
  };

  return { onPointerDown, onPointerMove, onPointerUp };
}
