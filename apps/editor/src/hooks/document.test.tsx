import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { OpenDoc } from '@openmake/core';
import { useChildren, useDocVersion, useNode } from './document.js';

describe('document hooks', () => {
  it('useDocVersion re-renders when the document changes', () => {
    const doc = OpenDoc.create();
    const { result } = renderHook(() => useDocVersion(doc));
    const initialVersion = result.current;

    act(() => {
      doc.createNode({
        type: 'RECTANGLE',
        parentId: doc.getPages()[0]!,
        x: 0,
        y: 0,
        width: 10,
        height: 10,
      });
    });

    expect(result.current).toBeGreaterThan(initialVersion);
  });

  it('useNode returns the live node snapshot and updates after a mutation', () => {
    const doc = OpenDoc.create();
    const pageId = doc.getPages()[0]!;
    const rectId = doc.createNode({
      type: 'RECTANGLE',
      parentId: pageId,
      x: 0,
      y: 0,
      width: 10,
      height: 10,
    });

    const { result } = renderHook(() => useNode(doc, rectId));
    expect(result.current?.x).toBe(0);

    act(() => {
      doc.updateNode(rectId, { x: 42 });
    });

    expect(result.current?.x).toBe(42);
  });

  it('useNode returns undefined for a missing id', () => {
    const doc = OpenDoc.create();
    const { result } = renderHook(() => useNode(doc, 'nonexistent'));
    expect(result.current).toBeUndefined();
  });

  it('useChildren returns live children ids and updates on structural change', () => {
    const doc = OpenDoc.create();
    const pageId = doc.getPages()[0]!;
    const { result } = renderHook(() => useChildren(doc, pageId));
    expect(result.current).toEqual([]);

    let rectId = '';
    act(() => {
      rectId = doc.createNode({
        type: 'RECTANGLE',
        parentId: pageId,
        x: 0,
        y: 0,
        width: 10,
        height: 10,
      });
    });

    expect(result.current).toEqual([rectId]);
  });
});
