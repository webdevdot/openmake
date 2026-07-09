import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OpenDoc } from '@openmake/core';
import { Canvas } from './Canvas.js';
import { useSelectionStore } from '../../store/selection.js';
import { useToolStore } from '../../store/tool.js';

// Canvas pulls in CanvasKit (WASM) via @openmake/renderer, which has no place
// in a jsdom/happy-dom unit test — mock the whole module so Canvas can mount
// without touching real WASM or a real <canvas> GPU context.
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

// canvaskit-init imports the .wasm?url asset, which vitest can't resolve.
vi.mock('../../canvas/canvaskit-init.js', () => ({ canvasKitReady: Promise.resolve({}) }));

// Font loading does a real fetch() of the bundled TTF assets, which has no
// place in a unit test environment (happy-dom has no asset server running).
vi.mock('../../canvas/fonts.js', () => ({
  loadEditorFonts: vi.fn().mockResolvedValue(undefined),
}));

afterEach(() => {
  useSelectionStore.setState({ selectedIds: [] });
  useToolStore.setState({ tool: 'select' });
  vi.restoreAllMocks();
});

describe('Canvas', () => {
  it('mounts and renders the canvas surface without throwing', async () => {
    const doc = OpenDoc.create();
    const pageId = doc.getPages()[0]!;

    render(<Canvas doc={doc} pageId={pageId} fileId="file-1" />);

    expect(screen.getByTestId('canvas-container')).toBeTruthy();
    expect(screen.getByTestId('canvas-surface')).toBeTruthy();

    await waitFor(() => expect(screen.getByTestId('overlay-layer')).toBeTruthy());
  });
});
