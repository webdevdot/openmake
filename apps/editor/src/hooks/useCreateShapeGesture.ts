import { useRef } from 'react';
import type { RefObject } from 'react';
import type { OpenDoc } from '@openmake/core';
import type { NodeType } from '@openmake/shared';
import { useToolStore } from '../store/tool.js';
import { useSelectionStore } from '../store/selection.js';
import { screenToWorld, type Camera } from '../canvas/camera.js';
import { normalizeRect } from '../canvas/marquee.js';

const TOOL_TO_NODE_TYPE: Partial<Record<string, NodeType>> = {
  frame: 'FRAME',
  rectangle: 'RECTANGLE',
  ellipse: 'ELLIPSE',
  line: 'LINE',
};

const DEFAULT_FILL = {
  type: 'SOLID' as const,
  color: { r: 0.85, g: 0.85, b: 0.85, a: 1 },
  opacity: 1,
  visible: true,
};

export function useCreateShapeGesture({
  doc,
  pageId,
  cameraRef,
  onCreated,
}: {
  doc: OpenDoc;
  pageId: string;
  cameraRef: RefObject<Camera>;
  onCreated: () => void;
}) {
  const draftId = useRef<string | null>(null);
  const startWorld = useRef<{ x: number; y: number } | null>(null);

  const onPointerDown = (_e: React.PointerEvent, screen: { x: number; y: number }) => {
    const tool = useToolStore.getState().tool;
    const nodeType = TOOL_TO_NODE_TYPE[tool];
    if (!nodeType || !cameraRef.current) return;
    const world = screenToWorld(cameraRef.current, screen);
    startWorld.current = world;
    const id = doc.createNode({
      type: nodeType,
      parentId: pageId,
      x: world.x,
      y: world.y,
      width: 1,
      height: 1,
      ...(nodeType === 'LINE'
        ? { strokes: [{ paint: DEFAULT_FILL, weight: 1, align: 'CENTER' as const }] }
        : { fills: [DEFAULT_FILL] }),
    });
    draftId.current = id;
    useSelectionStore.getState().set([id]);
  };

  const onPointerMove = (e: React.PointerEvent, screen: { x: number; y: number }) => {
    if (!draftId.current || !startWorld.current || !cameraRef.current) return;
    const world = screenToWorld(cameraRef.current, screen);
    const rect = normalizeRect(startWorld.current, world);
    if (e.shiftKey) {
      const size = Math.max(rect.width, rect.height);
      doc.updateNode(draftId.current, {
        x: rect.x,
        y: rect.y,
        width: size || 1,
        height: size || 1,
      });
    } else {
      doc.updateNode(draftId.current, {
        x: rect.x,
        y: rect.y,
        width: rect.width || 1,
        height: rect.height || 1,
      });
    }
  };

  const onPointerUp = (_e: React.PointerEvent) => {
    draftId.current = null;
    startWorld.current = null;
    onCreated();
  };

  const createTextAt = (world: { x: number; y: number }): string => {
    const id = doc.createNode({
      type: 'TEXT',
      parentId: pageId,
      x: world.x,
      y: world.y,
      width: 200,
      height: 24,
      characters: '',
      fills: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0, a: 1 }, opacity: 1, visible: true }],
    });
    useSelectionStore.getState().set([id]);
    return id;
  };

  return { onPointerDown, onPointerMove, onPointerUp, createTextAt };
}
