import type { OpenDoc } from '@openmake/core';
import {
  buildRenderScene,
  type Renderer,
  type SceneOverrides,
  type VariableColors,
} from '@openmake/renderer';
import type { Camera } from './camera.js';

/**
 * Optional motion-playback hook. `advance(now)` moves the playback clock to the
 * current frame time and returns whether the override map changed (so the loop
 * knows to keep running); `isActive()` reports whether a node is still playing;
 * `getOverrides()` supplies the per-node sampled props threaded into the scene.
 */
export interface PlaybackDriver {
  advance: (now: number) => boolean;
  isActive: () => boolean;
  getOverrides: () => SceneOverrides;
}

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
    private readonly getImages?: () => Record<string, Uint8Array> | undefined,
    private readonly playback?: PlaybackDriver,
    private readonly getVariableColors?: () => VariableColors | undefined,
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

    // Motion playback drives its own clock: while a node is playing, advance the
    // sampled override each frame and keep the loop dirty so it re-renders. This
    // never writes to the doc — the overrides are transient and editor-local.
    const playing = this.playback?.isActive() ?? false;
    if (playing && this.playback) {
      this.playback.advance(performance.now());
      this.dirty = true;
    }

    if (this.dirty) {
      this.dirty = false;
      const pageId = this.getPageId();
      if (pageId) {
        const scene = buildRenderScene(
          this.doc,
          pageId,
          this.getImages?.(),
          this.playback?.getOverrides(),
          this.getVariableColors?.(),
        );
        this.renderer.render(scene, this.getCamera());
      }
    }

    // Keep the rAF alive for the next playback frame (the store may have stopped
    // during advance(), in which case isActive() is now false and we go idle).
    if (this.playback?.isActive()) this.schedule();
  };

  dispose(): void {
    this.disposed = true;
    this.unsubscribeDoc?.();
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
  }
}
