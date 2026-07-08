import { describe, expect, it } from 'vitest';
import type { NodeAnimation } from '@openmake/shared';
import type { PresetContext } from '../src/index.js';
import {
  fadeIn,
  fadeOut,
  resize,
  rotate,
  sampleAnimation,
  scaleIn,
  scaleOut,
  stackAnimation,
} from '../src/index.js';

const CTX: PresetContext = {
  x: 10,
  y: 20,
  width: 200,
  height: 100,
  rotation: 30,
  opacity: 0.8,
};

describe('sampleAnimation', () => {
  const linear: NodeAnimation = {
    duration: 1000,
    tracks: [
      {
        property: 'x',
        keyframes: [
          { time: 0, value: 0, easing: 'linear' },
          { time: 1000, value: 100, easing: 'linear' },
        ],
      },
    ],
  };

  it('returns exact endpoint values at t=0 and t=duration', () => {
    expect(sampleAnimation(linear, 0)).toEqual({ x: 0 });
    expect(sampleAnimation(linear, 1000)).toEqual({ x: 100 });
  });

  it('interpolates linearly at the midpoint', () => {
    expect(sampleAnimation(linear, 500)).toEqual({ x: 50 });
    expect(sampleAnimation(linear, 250)).toEqual({ x: 25 });
  });

  it('clamps to endpoints beyond [0, duration]', () => {
    expect(sampleAnimation(linear, -100)).toEqual({ x: 0 });
    expect(sampleAnimation(linear, 5000)).toEqual({ x: 100 });
  });

  it('applies ease-in (quadratic) at the midpoint', () => {
    const anim: NodeAnimation = {
      duration: 100,
      tracks: [
        {
          property: 'opacity',
          keyframes: [
            { time: 0, value: 0, easing: 'ease-in' },
            { time: 100, value: 1, easing: 'ease-in' },
          ],
        },
      ],
    };
    // ease-in: p^2 at p=0.5 -> 0.25.
    expect(sampleAnimation(anim, 50)).toEqual({ opacity: 0.25 });
  });

  it('applies ease-out (quadratic) at the midpoint', () => {
    const anim: NodeAnimation = {
      duration: 100,
      tracks: [
        {
          property: 'opacity',
          keyframes: [
            { time: 0, value: 0, easing: 'ease-out' },
            { time: 100, value: 1, easing: 'ease-out' },
          ],
        },
      ],
    };
    // ease-out: 1-(1-p)^2 at p=0.5 -> 0.75.
    expect(sampleAnimation(anim, 50)).toEqual({ opacity: 0.75 });
  });

  it('applies ease-in-out symmetrically', () => {
    const anim: NodeAnimation = {
      duration: 100,
      tracks: [
        {
          property: 'opacity',
          keyframes: [
            { time: 0, value: 0, easing: 'ease-in-out' },
            { time: 100, value: 1, easing: 'ease-in-out' },
          ],
        },
      ],
    };
    expect(sampleAnimation(anim, 50)).toEqual({ opacity: 0.5 });
    expect(sampleAnimation(anim, 25)).toEqual({ opacity: 0.125 });
  });

  it('uses the left keyframe easing between three keyframes', () => {
    const anim: NodeAnimation = {
      duration: 200,
      tracks: [
        {
          property: 'y',
          keyframes: [
            { time: 0, value: 0, easing: 'linear' },
            { time: 100, value: 10, easing: 'linear' },
            { time: 200, value: 30, easing: 'linear' },
          ],
        },
      ],
    };
    expect(sampleAnimation(anim, 50)).toEqual({ y: 5 });
    expect(sampleAnimation(anim, 100)).toEqual({ y: 10 });
    expect(sampleAnimation(anim, 150)).toEqual({ y: 20 });
  });

  it('samples multiple tracks at once', () => {
    const anim: NodeAnimation = {
      duration: 100,
      tracks: [
        {
          property: 'x',
          keyframes: [
            { time: 0, value: 0, easing: 'linear' },
            { time: 100, value: 100, easing: 'linear' },
          ],
        },
        {
          property: 'opacity',
          keyframes: [
            { time: 0, value: 1, easing: 'linear' },
            { time: 100, value: 0, easing: 'linear' },
          ],
        },
      ],
    };
    expect(sampleAnimation(anim, 50)).toEqual({ x: 50, opacity: 0.5 });
  });
});

describe('preset builders', () => {
  it('fadeIn goes 0 -> current opacity', () => {
    const anim = fadeIn(300, CTX);
    expect(anim.duration).toBe(300);
    expect(sampleAnimation(anim, 0)).toEqual({ opacity: 0 });
    expect(sampleAnimation(anim, 300)).toEqual({ opacity: 0.8 });
  });

  it('fadeOut goes current opacity -> 0', () => {
    const anim = fadeOut(300, CTX);
    expect(sampleAnimation(anim, 0)).toEqual({ opacity: 0.8 });
    expect(sampleAnimation(anim, 300)).toEqual({ opacity: 0 });
  });

  it('rotate adds turns * 360 to current rotation', () => {
    const anim = rotate(500, 2, CTX);
    expect(sampleAnimation(anim, 0)).toEqual({ rotation: 30 });
    expect(sampleAnimation(anim, 500)).toEqual({ rotation: 30 + 720 });
  });

  it('scaleIn grows width+height from 0 to current', () => {
    const anim = scaleIn(400, CTX);
    expect(sampleAnimation(anim, 0)).toEqual({ width: 0, height: 0 });
    expect(sampleAnimation(anim, 400)).toEqual({ width: 200, height: 100 });
  });

  it('scaleOut shrinks width+height from current to 0', () => {
    const anim = scaleOut(400, CTX);
    expect(sampleAnimation(anim, 0)).toEqual({ width: 200, height: 100 });
    expect(sampleAnimation(anim, 400)).toEqual({ width: 0, height: 0 });
  });

  it('resize offsets width/height by dw/dh', () => {
    const anim = resize(250, 50, -20, CTX);
    expect(sampleAnimation(anim, 0)).toEqual({ width: 200, height: 100 });
    expect(sampleAnimation(anim, 250)).toEqual({ width: 250, height: 80 });
  });
});

describe('stackAnimation', () => {
  it('returns a copy of the addition when there is no existing animation', () => {
    const addition = fadeIn(300, CTX);
    const stacked = stackAnimation(undefined, addition);
    expect(stacked.duration).toBe(300);
    expect(stacked.tracks).toEqual(addition.tracks);
    expect(stacked.tracks).not.toBe(addition.tracks);
  });

  it('unions tracks across different properties', () => {
    const existing = fadeIn(300, CTX);
    const addition = rotate(500, 1, CTX);
    const stacked = stackAnimation(existing, addition);
    const props = stacked.tracks.map((t) => t.property).sort();
    expect(props).toEqual(['opacity', 'rotation']);
    expect(stacked.duration).toBe(500);
  });

  it('addition wins on a same-property conflict (later stacked wins)', () => {
    const existing = fadeIn(300, CTX); // opacity 0 -> 0.8
    const addition = fadeOut(300, CTX); // opacity 0.8 -> 0
    const stacked = stackAnimation(existing, addition);
    expect(stacked.tracks).toHaveLength(1);
    expect(stacked.tracks[0]!.property).toBe('opacity');
    // Should be the fadeOut track: starts at 0.8, ends at 0.
    expect(sampleAnimation(stacked, 0)).toEqual({ opacity: 0.8 });
    expect(sampleAnimation(stacked, 300)).toEqual({ opacity: 0 });
  });

  it('duration is the max of the two animations', () => {
    const existing = fadeIn(1000, CTX);
    const addition = rotate(200, 1, CTX);
    expect(stackAnimation(existing, addition).duration).toBe(1000);
    expect(stackAnimation(rotate(200, 1, CTX), fadeIn(1000, CTX)).duration).toBe(1000);
  });
});
