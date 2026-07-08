import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OpenDoc } from '@openmake/core';
import type { Camera } from '../../canvas/camera.js';
import { PresentOverlay } from './PresentOverlay.js';

const { renderSpy } = vi.hoisted(() => ({ renderSpy: vi.fn() }));

// PresentOverlay pulls in CanvasKit (WASM) via @openmake/renderer, which has
// no place in a happy-dom unit test — mock the whole module (same approach as
// Canvas.test.tsx) and capture the camera each render is called with.
vi.mock('@openmake/renderer', () => ({
  createCanvasKitRenderer: vi.fn(async () => ({
    render: renderSpy,
    resize: vi.fn(),
    exportPNG: vi.fn(),
    dispose: vi.fn(),
  })),
  buildRenderScene: vi.fn().mockReturnValue({ nodes: {}, rootIds: [] }),
}));

// Font loading does a real fetch() of bundled TTF assets.
vi.mock('../../canvas/fonts.js', () => ({
  loadEditorFonts: vi.fn().mockResolvedValue(undefined),
}));

afterEach(() => {
  renderSpy.mockClear();
});

const FRAME_SIZE = 1000;

function setup() {
  const doc = OpenDoc.create();
  const pageId = doc.getPages()[0]!;
  const frameId = doc.createNode({
    type: 'FRAME',
    parentId: pageId,
    name: 'Frame 1',
    x: 0,
    y: 0,
    width: FRAME_SIZE,
    height: FRAME_SIZE,
  });
  return { doc, pageId, frameId };
}

describe('PresentOverlay fit', () => {
  it('fits the frame with at least a 48px margin on every side (no edge clipping)', async () => {
    const { doc, pageId, frameId } = setup();
    render(<PresentOverlay doc={doc} pageId={pageId} startFrameId={frameId} onExit={() => {}} />);

    await waitFor(() => expect(renderSpy).toHaveBeenCalled());
    const camera = renderSpy.mock.calls[0]![1] as Camera;

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const toScreen = (wx: number, wy: number) => ({
      x: (wx - camera.x) * camera.zoom,
      y: (wy - camera.y) * camera.zoom,
    });
    const topLeft = toScreen(0, 0);
    const bottomRight = toScreen(FRAME_SIZE, FRAME_SIZE);

    // The whole frame is inside the viewport with breathing room — the old
    // padding of 0 made the frame touch (and visually clip at) the edges.
    expect(topLeft.x).toBeGreaterThanOrEqual(48 - 1e-6);
    expect(topLeft.y).toBeGreaterThanOrEqual(48 - 1e-6);
    expect(bottomRight.x).toBeLessThanOrEqual(vw - 48 + 1e-6);
    expect(bottomRight.y).toBeLessThanOrEqual(vh - 48 + 1e-6);

    // Fit is tight on the constraining axis: zoom fills viewport minus padding.
    const expectedZoom = Math.min((vw - 96) / FRAME_SIZE, (vh - 96) / FRAME_SIZE);
    expect(camera.zoom).toBeCloseTo(expectedZoom, 6);
  });
});

describe('PresentOverlay exit chip', () => {
  it('keeps testid/position and uses readable floating-panel styling', () => {
    const { doc, pageId, frameId } = setup();
    const onExit = vi.fn();
    render(<PresentOverlay doc={doc} pageId={pageId} startFrameId={frameId} onExit={onExit} />);

    const chip = screen.getByTestId('present-exit-button');
    expect(chip.className).toContain('bg-floating-app');
    expect(chip.className).toContain('text-zinc-100');
    expect(chip.className).toContain('right-4');
    expect(chip.className).toContain('top-4');

    fireEvent.click(chip);
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('exits on Escape', () => {
    const { doc, pageId, frameId } = setup();
    const onExit = vi.fn();
    render(<PresentOverlay doc={doc} pageId={pageId} startFrameId={frameId} onExit={onExit} />);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onExit).toHaveBeenCalledTimes(1);
  });
});
