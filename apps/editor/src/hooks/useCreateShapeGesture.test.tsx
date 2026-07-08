import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { OpenDoc } from '@openmake/core';
import { useCreateShapeGesture } from './useCreateShapeGesture.js';
import { useToolStore, type ToolId } from '../store/tool.js';
import { DEFAULT_CAMERA, type Camera } from '../canvas/camera.js';

afterEach(() => {
  useToolStore.setState({ tool: 'select' });
});

/** Minimal PointerEvent stand-in for the gesture handlers (only shiftKey is read). */
const ptr = (shiftKey = false) => ({ shiftKey }) as unknown as React.PointerEvent;

function setup(tool: ToolId) {
  const doc = OpenDoc.create();
  const pageId = doc.getPages()[0]!;
  const cameraRef = { current: { ...DEFAULT_CAMERA } as Camera };
  useToolStore.setState({ tool });
  const { result } = renderHook(() =>
    useCreateShapeGesture({ doc, pageId, cameraRef, onCreated: () => {} }),
  );
  return { doc, pageId, gesture: result };
}

describe('useCreateShapeGesture', () => {
  it('drag-creates a POLYGON node with the schema-default pointCount (3)', () => {
    const { doc, pageId, gesture } = setup('polygon');

    act(() => {
      gesture.current.onPointerDown(ptr(), { x: 10, y: 20 });
      gesture.current.onPointerMove(ptr(), { x: 110, y: 80 });
      gesture.current.onPointerUp(ptr());
    });

    const childIds = doc.getChildrenIds(pageId);
    expect(childIds).toHaveLength(1);
    const node = doc.getNode(childIds[0]!);
    expect(node?.type).toBe('POLYGON');
    // width/height come from the drag rect; defaults fill in pointCount.
    expect(node).toMatchObject({ x: 10, y: 20, width: 100, height: 60, pointCount: 3 });
  });

  it('drag-creates a STAR node with schema defaults (pointCount 5, innerRadius 0.38)', () => {
    const { doc, pageId, gesture } = setup('star');

    act(() => {
      gesture.current.onPointerDown(ptr(), { x: 0, y: 0 });
      gesture.current.onPointerMove(ptr(), { x: 50, y: 40 });
      gesture.current.onPointerUp(ptr());
    });

    const node = doc.getNode(doc.getChildrenIds(pageId)[0]!);
    expect(node?.type).toBe('STAR');
    expect(node).toMatchObject({ width: 50, height: 40, pointCount: 5, innerRadius: 0.38 });
  });

  it('shift-drag constrains a polygon to a square', () => {
    const { doc, pageId, gesture } = setup('polygon');

    act(() => {
      gesture.current.onPointerDown(ptr(), { x: 0, y: 0 });
      gesture.current.onPointerMove(ptr(true), { x: 120, y: 40 });
      gesture.current.onPointerUp(ptr(true));
    });

    const node = doc.getNode(doc.getChildrenIds(pageId)[0]!);
    expect(node?.width).toBe(120);
    expect(node?.height).toBe(120);
  });
});
