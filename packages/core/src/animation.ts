import type {
  AnimTrack,
  Easing,
  Keyframe,
  NodeAnimation,
  TrackProperty,
} from '@openmake/shared';

/**
 * Pure motion engine: sampling a {@link NodeAnimation} at a given time, building
 * preset tracks relative to a node's current values, and stacking animations
 * (Figma-style, later track wins). Nothing here touches the doc — the caller
 * feeds in the animation definition and receives plain numbers back.
 */

/** Apply a cubic-ish easing curve to a normalized progress `p` in [0, 1]. */
function ease(p: number, easing: Easing): number {
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  switch (easing) {
    case 'linear':
      return p;
    case 'ease-in':
      // Quadratic accel from rest.
      return p * p;
    case 'ease-out':
      // Quadratic decel to rest.
      return 1 - (1 - p) * (1 - p);
    case 'ease-in-out':
      // Symmetric quadratic in/out.
      return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
  }
}

/**
 * Sample a single track at time `t` (ms). Keyframes are assumed sorted by time.
 * Before the first / after the last keyframe the value is clamped to that
 * endpoint. Between two keyframes the segment's easing (taken from the LEFT
 * keyframe) drives interpolation.
 */
function sampleTrack(track: AnimTrack, t: number): number {
  const kfs = track.keyframes;
  const first = kfs[0]!;
  const last = kfs[kfs.length - 1]!;
  if (t <= first.time) return first.value;
  if (t >= last.time) return last.value;

  // Find the bracketing pair [a, b] with a.time <= t < b.time.
  let a: Keyframe = first;
  let b: Keyframe = last;
  for (let i = 0; i < kfs.length - 1; i++) {
    const lo = kfs[i]!;
    const hi = kfs[i + 1]!;
    if (t >= lo.time && t <= hi.time) {
      a = lo;
      b = hi;
      break;
    }
  }

  const span = b.time - a.time;
  // Coincident keyframes (zero-length segment): jump to the later value.
  if (span <= 0) return b.value;
  const p = ease((t - a.time) / span, a.easing);
  return a.value + (b.value - a.value) * p;
}

/**
 * Sample every track of an animation at time `t` (ms), returning a partial map
 * of property → value. `t` is clamped to [0, duration] so scrubbing past the
 * ends holds the endpoint pose. Tracks with fewer than two keyframes are
 * skipped (they define no segment).
 */
export function sampleAnimation(
  anim: NodeAnimation,
  t: number,
): Partial<Record<TrackProperty, number>> {
  const clamped = Math.max(0, Math.min(anim.duration, t));
  const out: Partial<Record<TrackProperty, number>> = {};
  for (const track of anim.tracks) {
    if (track.keyframes.length < 2) continue;
    out[track.property] = sampleTrack(track, clamped);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Preset builders — tracks are RELATIVE to the node's current values.
// ---------------------------------------------------------------------------

/** Current values a preset needs to anchor its keyframes against. */
export interface PresetContext {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
}

function track(
  property: TrackProperty,
  from: number,
  to: number,
  duration: number,
  easing: Easing,
): AnimTrack {
  return {
    property,
    keyframes: [
      { time: 0, value: from, easing },
      { time: duration, value: to, easing },
    ],
  };
}

/** Fade from fully transparent up to the node's current opacity. */
export function fadeIn(duration: number, ctx: PresetContext): NodeAnimation {
  return { duration, tracks: [track('opacity', 0, ctx.opacity, duration, 'ease-out')] };
}

/** Fade from the node's current opacity down to fully transparent. */
export function fadeOut(duration: number, ctx: PresetContext): NodeAnimation {
  return { duration, tracks: [track('opacity', ctx.opacity, 0, duration, 'ease-in')] };
}

/** Rotate by `turns` full revolutions on top of the current rotation. */
export function rotate(duration: number, turns: number, ctx: PresetContext): NodeAnimation {
  return {
    duration,
    tracks: [track('rotation', ctx.rotation, ctx.rotation + turns * 360, duration, 'ease-in-out')],
  };
}

/** Grow from zero size up to the node's current width/height. */
export function scaleIn(duration: number, ctx: PresetContext): NodeAnimation {
  return {
    duration,
    tracks: [
      track('width', 0, ctx.width, duration, 'ease-out'),
      track('height', 0, ctx.height, duration, 'ease-out'),
    ],
  };
}

/** Shrink from the node's current width/height down to zero size. */
export function scaleOut(duration: number, ctx: PresetContext): NodeAnimation {
  return {
    duration,
    tracks: [
      track('width', ctx.width, 0, duration, 'ease-in'),
      track('height', ctx.height, 0, duration, 'ease-in'),
    ],
  };
}

/** Resize by `dw`/`dh` from the node's current width/height. */
export function resize(
  duration: number,
  dw: number,
  dh: number,
  ctx: PresetContext,
): NodeAnimation {
  return {
    duration,
    tracks: [
      track('width', ctx.width, ctx.width + dw, duration, 'ease-in-out'),
      track('height', ctx.height, ctx.height + dh, duration, 'ease-in-out'),
    ],
  };
}

// ---------------------------------------------------------------------------
// Stacking
// ---------------------------------------------------------------------------

/**
 * Merge `addition` onto `existing`, Figma-style: the union of tracks, and for a
 * property present in both the ADDITION's track wins (later stacked wins). The
 * result's duration is the max of the two, so a longer addition extends the
 * timeline and a shorter one leaves the existing length intact.
 */
export function stackAnimation(
  existing: NodeAnimation | undefined,
  addition: NodeAnimation,
): NodeAnimation {
  if (!existing) return { duration: addition.duration, tracks: [...addition.tracks] };

  const byProperty = new Map<TrackProperty, AnimTrack>();
  for (const t of existing.tracks) byProperty.set(t.property, t);
  for (const t of addition.tracks) byProperty.set(t.property, t); // addition wins

  return {
    duration: Math.max(existing.duration, addition.duration),
    tracks: [...byProperty.values()],
  };
}
