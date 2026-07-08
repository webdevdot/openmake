import { create } from 'zustand';
import { sampleAnimation } from '@openmake/core';
import type { NodeAnimation, TrackProperty } from '@openmake/shared';

/**
 * Editor-local playback state for motion previews.
 *
 * Playback must NEVER write sampled values back into the doc — that would spam
 * Yjs updates to collaborators and pollute the undo stack. Instead, exactly
 * like the image-bytes cache, this store holds a transient per-node override
 * map (nodeId → sampled Partial props) that the render path merges on top of
 * the persisted node just for the current frame. Stopping playback clears the
 * overrides and the node snaps back to its authored pose.
 *
 * One node plays at a time in v1 (the single selected node). The RenderLoop
 * drives time: each rAF tick calls {@link advance} with the current clock, which
 * recomputes the override and returns whether a repaint is needed.
 */
interface PlayingState {
  nodeId: string;
  anim: NodeAnimation;
  /** performance.now() timestamp captured when play started. */
  startedAt: number;
}

interface AnimationState {
  /** The node currently playing, or null when idle. */
  playing: PlayingState | null;
  /** nodeId → sampled property overrides for the current frame. */
  overrides: Record<string, Partial<Record<TrackProperty, number>>>;
  /** Begin playing `anim` for `nodeId` from t=0. */
  play: (nodeId: string, anim: NodeAnimation, now: number) => void;
  /** Stop playback and drop all overrides (node returns to its authored pose). */
  stop: () => void;
  /**
   * Advance the clock to `now`. Recomputes the playing node's override and,
   * once the timeline reaches its end, stops (v1: no looping). Returns true when
   * the override changed so the caller can mark the render loop dirty.
   */
  advance: (now: number) => boolean;
  /** True while a node is actively animating. */
  isPlaying: (nodeId: string) => boolean;
}

export const useAnimationStore = create<AnimationState>((set, get) => ({
  playing: null,
  overrides: {},

  play: (nodeId, anim, now) => {
    set({
      playing: { nodeId, anim, startedAt: now },
      overrides: { [nodeId]: sampleAnimation(anim, 0) },
    });
  },

  stop: () => {
    if (!get().playing && Object.keys(get().overrides).length === 0) return;
    set({ playing: null, overrides: {} });
  },

  advance: (now) => {
    const { playing } = get();
    if (!playing) return false;
    const elapsed = now - playing.startedAt;
    if (elapsed >= playing.anim.duration) {
      // v1: stop at the end (no looping) and return the node to its authored pose.
      set({ playing: null, overrides: {} });
      return true;
    }
    set({ overrides: { [playing.nodeId]: sampleAnimation(playing.anim, elapsed) } });
    return true;
  },

  isPlaying: (nodeId) => get().playing?.nodeId === nodeId,
}));
