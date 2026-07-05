import type { OpenDoc } from '@openmake/core';
import { buildRenderScene, type Renderer } from '@openmake/renderer';
import type { Camera } from './camera.js';

/**
 * Drives a single requestAnimationFrame loop for a renderer + document +
 * camera. Any mutation (doc.subscribe) or camera change marks the loop dirty;
 * the next frame re-renders once and goes idle again. Hot-path code (drag,
 * pan, zoom) should call `markDirty()` directly instead of touching React
 * state, per the architecture rules.
 */
export class RenderLoop {
  private dirty = true;
  private disposed = false;
  private rafId: number | null = null;
  private unsubscribeDoc: (() => void) | null = null;

  constructor(
    private readonly renderer: Renderer,
    private readonly doc: OpenDoc,
    private readonly getPageId: () => string | null,
    private readonly getCamera: () => Camera,
  ) {
    this.unsubscribeDoc = doc.subscribe(() => this.markDirty());
    this.schedule();
  }

  markDirty(): void {
    this.dirty = true;
    this.schedule();
  }

  private schedule(): void {
    if (this.rafId !== null || this.disposed) return;
    this.rafId = requestAnimationFrame(this.tick);
  }

  private tick = (): void => {
    this.rafId = null;
    if (this.disposed) return;
    if (this.dirty) {
      this.dirty = false;
      const pageId = this.getPageId();
      if (pageId) {
        const scene = buildRenderScene(this.doc, pageId);
        this.renderer.render(scene, this.getCamera());
      }
    }
  };

  dispose(): void {
    this.disposed = true;
    this.unsubscribeDoc?.();
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
  }
}
