import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OpenDoc } from '@openmake/core';
import { Canvas } from './Canvas.js';
import { useToolStore } from '../../store/tool.js';
import { useCommentsStore } from '../../store/comments.js';

// Same renderer/WASM mocks as Canvas.test.tsx — Canvas pulls CanvasKit which
// has no place in a happy-dom unit test.
vi.mock('@openmake/renderer', () => ({
  createCanvasKitRenderer: vi.fn().mockResolvedValue({
    render: vi.fn(),
    resize: vi.fn(),
    exportPNG: vi.fn(),
    dispose: vi.fn(),
  }),
  buildRenderScene: vi.fn().mockReturnValue({ nodes: {}, rootIds: [] }),
  registerFont: vi.fn(),
  loadCanvasKit: vi.fn().mockResolvedValue({}),
}));
vi.mock('../../canvas/canvaskit-init.js', () => ({ canvasKitReady: Promise.resolve({}) }));
vi.mock('../../canvas/fonts.js', () => ({
  loadEditorFonts: vi.fn().mockResolvedValue(undefined),
}));

afterEach(() => {
  useToolStore.setState({ tool: 'select' });
  useCommentsStore.getState().reset();
  vi.restoreAllMocks();
});

describe('Canvas comment tool', () => {
  it('drops a draft pin at the clicked world point in comment mode', async () => {
    const doc = OpenDoc.create();
    const pageId = doc.getPages()[0]!;
    useToolStore.setState({ tool: 'comment' });

    render(<Canvas doc={doc} pageId={pageId} fileId="file-1" />);
    await waitFor(() => expect(screen.getByTestId('comments-overlay')).toBeTruthy());

    const surface = screen.getByTestId('canvas-surface');
    surface.setPointerCapture = vi.fn();
    surface.releasePointerCapture = vi.fn();

    fireEvent.pointerDown(surface, { pointerId: 1, clientX: 120, clientY: 90, button: 0 });
    fireEvent.pointerUp(surface, { pointerId: 1, clientX: 120, clientY: 90, button: 0 });

    // DEFAULT_CAMERA (0,0,zoom 1) + zeroed getBoundingClientRect → world == client.
    const draft = useCommentsStore.getState().draftPin;
    expect(draft).toEqual({ x: 120, y: 90 });
    // The composer appears for the new pin.
    expect(screen.getByTestId('comment-composer')).toBeTruthy();
  });
});
