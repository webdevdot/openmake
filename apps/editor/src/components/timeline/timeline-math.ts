/**
 * Pure time<->pixel mapping for the timeline panel. The track area spans a
 * fixed pixel `width` mapping linearly onto `[0, duration]` (ms). Nothing here
 * touches React or the doc — the panel feeds in geometry and gets numbers back.
 */

/** Map a time in ms to an x-offset (px) within a track lane of the given width. */
export function timeToPx(time: number, duration: number, width: number): number {
  if (duration <= 0) return 0;
  const clamped = Math.max(0, Math.min(duration, time));
  return (clamped / duration) * width;
}

/** Map an x-offset (px) within a lane back to a time in ms, clamped to [0, duration]. */
export function pxToTime(px: number, duration: number, width: number): number {
  if (width <= 0) return 0;
  const t = (px / width) * duration;
  return Math.max(0, Math.min(duration, t));
}

/**
 * Clamp a retimed keyframe to the timeline and, so a track never crosses its
 * neighbors, to the open interval between the adjacent keyframes' times.
 * `index` is the keyframe's position in a time-sorted `times` array. Endpoints
 * are pinned by their outer bound only (0 for the first, duration for the last).
 */
export function clampKeyframeTime(
  time: number,
  index: number,
  times: readonly number[],
  duration: number,
): number {
  const lower = index > 0 ? times[index - 1]! : 0;
  const upper = index < times.length - 1 ? times[index + 1]! : duration;
  const lo = Math.max(0, lower);
  const hi = Math.min(duration, upper);
  return Math.max(lo, Math.min(hi, time));
}

/**
 * Build evenly spaced ruler tick times (ms) across `[0, duration]`, inclusive of
 * both ends. `count` is the number of intervals (so `count + 1` ticks). A
 * non-positive count or duration yields a single tick at 0.
 */
export function rulerTicks(duration: number, count: number): number[] {
  if (duration <= 0 || count <= 0) return [0];
  const ticks: number[] = [];
  for (let i = 0; i <= count; i++) ticks.push((duration * i) / count);
  return ticks;
}
