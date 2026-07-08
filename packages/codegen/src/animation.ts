import { sampleAnimation } from '@openmake/core';
import type { Easing, NodeAnimation, TrackProperty } from '@openmake/shared';
import { round2 } from './color.js';

/**
 * Animation → production-code emitters. These are PURE: given a
 * {@link NodeAnimation} they return CSS/JS source strings and never touch the
 * doc or the DOM.
 *
 * The core trick is that we do NOT re-derive interpolation here. We reuse the
 * engine's own {@link sampleAnimation} (from `@openmake/core`) to compute the
 * exact property values at each percentage stop, so exported code is
 * frame-for-frame faithful to what the editor plays back.
 */

/**
 * The four editor {@link Easing} values are valid CSS `<easing-function>`
 * keywords verbatim (`linear`, `ease-in`, `ease-out`, `ease-in-out`), so the
 * class-level `animation`/WAAPI `easing` field can pass them straight through.
 * Asserted by a test. We take the easing from the FIRST keyframe of the first
 * track as the animation-level timing function; per-segment easing is already
 * baked into the sampled stop values, so this is only a sensible default for
 * the overall timing curve of the single generated `animation` shorthand.
 */
function animationLevelEasing(anim: NodeAnimation): Easing {
  const first = anim.tracks[0]?.keyframes[0]?.easing;
  return first ?? 'linear';
}

/** All distinct keyframe times across every track, plus 0 and the duration. */
function stopTimes(anim: NodeAnimation): number[] {
  const times = new Set<number>([0, anim.duration]);
  for (const track of anim.tracks) {
    for (const kf of track.keyframes) {
      // Ignore keyframes past the declared duration; sampling clamps anyway.
      if (kf.time >= 0 && kf.time <= anim.duration) times.add(kf.time);
    }
  }
  return [...times].sort((a, b) => a - b);
}

/** A stop's sampled property values expressed as CSS declaration lines. */
function declarationsAt(
  props: Partial<Record<TrackProperty, number>>,
  base: Partial<Record<TrackProperty, number>>,
): string[] {
  const decls: string[] = [];

  // x/y in the doc are ABSOLUTE canvas positions. Emitting them literally would
  // teleport the element to canvas coordinates, so we emit translate DELTAS
  // relative to the 0%-stop values — the exported animation MOVES the element
  // from its authored position rather than repositioning it.
  const hasX = props.x !== undefined;
  const hasY = props.y !== undefined;
  const hasRotation = props.rotation !== undefined;
  if (hasX || hasY || hasRotation) {
    const transforms: string[] = [];
    if (hasX || hasY) {
      const dx = round2((props.x ?? base.x ?? 0) - (base.x ?? 0));
      const dy = round2((props.y ?? base.y ?? 0) - (base.y ?? 0));
      transforms.push(`translate(${dx}px, ${dy}px)`);
    }
    if (hasRotation) {
      // rotation appends to the SAME transform, order: translate then rotate.
      transforms.push(`rotate(${round2(props.rotation!)}deg)`);
    }
    decls.push(`transform: ${transforms.join(' ')};`);
  }

  if (props.width !== undefined) decls.push(`width: ${round2(props.width)}px;`);
  if (props.height !== undefined) decls.push(`height: ${round2(props.height)}px;`);
  if (props.opacity !== undefined) decls.push(`opacity: ${round2(props.opacity)};`);

  return decls;
}

/** Percentage label for a stop time, e.g. 0 -> "0%", duration -> "100%". */
function percent(time: number, duration: number): string {
  if (duration <= 0) return '0%';
  return `${round2((time / duration) * 100)}%`;
}

/**
 * A complete `@keyframes <name> { ... }` block plus a `.<name>` class that
 * carries the `animation` shorthand.
 *
 * Fill-mode is `none`: after the run the element returns to its authored pose,
 * matching the editor's playback semantics (Stop restores the doc values rather
 * than freezing on the final keyframe).
 */
export function cssKeyframesFor(name: string, anim: NodeAnimation): string {
  const stops = stopTimes(anim);
  const base = sampleAnimation(anim, 0);

  const blocks = stops
    .map((time) => {
      const props = sampleAnimation(anim, time);
      const decls = declarationsAt(props, base);
      const body = decls.map((d) => `    ${d}`).join('\n');
      return `  ${percent(time, anim.duration)} {\n${body}\n  }`;
    })
    .join('\n');

  const easing = animationLevelEasing(anim);
  // `1` = one iteration, `none` = fill-mode none (return to authored pose).
  const rule = `.${name} {\n  animation: ${name} ${round2(anim.duration)}ms ${easing} 1 none;\n}`;

  return `@keyframes ${name} {\n${blocks}\n}\n\n${rule}`;
}

/**
 * A Web Animations API snippet: `element.animate([...keyframes], { ... })`.
 * Keyframes reuse the same sampled stops (offset-addressed) so runtime motion
 * matches the CSS output and the editor. `fill: 'none'` mirrors the CSS choice.
 */
export function waapiSnippetFor(anim: NodeAnimation): string {
  const stops = stopTimes(anim);
  const base = sampleAnimation(anim, 0);
  const duration = anim.duration;

  const frames = stops.map((time) => {
    const props = sampleAnimation(anim, time);
    const entries: string[] = [`offset: ${round2(duration <= 0 ? 0 : time / duration)}`];

    const hasX = props.x !== undefined;
    const hasY = props.y !== undefined;
    const hasRotation = props.rotation !== undefined;
    if (hasX || hasY || hasRotation) {
      const transforms: string[] = [];
      if (hasX || hasY) {
        const dx = round2((props.x ?? base.x ?? 0) - (base.x ?? 0));
        const dy = round2((props.y ?? base.y ?? 0) - (base.y ?? 0));
        transforms.push(`translate(${dx}px, ${dy}px)`);
      }
      if (hasRotation) transforms.push(`rotate(${round2(props.rotation!)}deg)`);
      entries.push(`transform: '${transforms.join(' ')}'`);
    }
    if (props.width !== undefined) entries.push(`width: '${round2(props.width)}px'`);
    if (props.height !== undefined) entries.push(`height: '${round2(props.height)}px'`);
    if (props.opacity !== undefined) entries.push(`opacity: ${round2(props.opacity)}`);

    return `  { ${entries.join(', ')} }`;
  });

  const easing = animationLevelEasing(anim);
  return `element.animate([\n${frames.join(',\n')}\n], { duration: ${round2(
    duration,
  )}, easing: '${easing}', fill: 'none' });`;
}
