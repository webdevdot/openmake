import { describe, expect, it } from 'vitest';
import type { Easing, NodeAnimation } from '@openmake/shared';
import { cssKeyframesFor, waapiSnippetFor } from '../src/index.js';

/** Single-track opacity fade (0 -> 1) over 300ms, linear. */
function fadeAnim(): NodeAnimation {
  return {
    duration: 300,
    tracks: [
      {
        property: 'opacity',
        keyframes: [
          { time: 0, value: 0, easing: 'linear' },
          { time: 300, value: 1, easing: 'linear' },
        ],
      },
    ],
  };
}

/**
 * Multi-track: x/y move + rotation + opacity, with the position track carrying
 * an extra middle keyframe at 150ms so the stop-union is exercised.
 * x: 100 -> 150 -> 200 (absolute canvas coords), y: 50 -> 90,
 * rotation: 0 -> 90, opacity: 1 -> 0.
 */
function multiAnim(): NodeAnimation {
  return {
    duration: 400,
    tracks: [
      {
        property: 'x',
        keyframes: [
          { time: 0, value: 100, easing: 'linear' },
          { time: 150, value: 150, easing: 'linear' },
          { time: 400, value: 200, easing: 'linear' },
        ],
      },
      {
        property: 'y',
        keyframes: [
          { time: 0, value: 50, easing: 'linear' },
          { time: 400, value: 90, easing: 'linear' },
        ],
      },
      {
        property: 'rotation',
        keyframes: [
          { time: 0, value: 0, easing: 'linear' },
          { time: 400, value: 90, easing: 'linear' },
        ],
      },
      {
        property: 'opacity',
        keyframes: [
          { time: 0, value: 1, easing: 'linear' },
          { time: 400, value: 0, easing: 'linear' },
        ],
      },
    ],
  };
}

describe('cssKeyframesFor', () => {
  it('emits a complete @keyframes block and a class for a single-track fade', () => {
    const css = cssKeyframesFor('fade', fadeAnim());
    expect(css).toContain('@keyframes fade {');
    expect(css).toContain('0% {');
    expect(css).toContain('opacity: 0;');
    expect(css).toContain('100% {');
    expect(css).toContain('opacity: 1;');
    // The class carries the animation shorthand.
    expect(css).toContain('.fade {');
    expect(css).toContain('animation: fade 300ms linear 1 none;');
  });

  it('uses fill-mode none so the element returns to its authored pose', () => {
    const css = cssKeyframesFor('fade', fadeAnim());
    // The last token of the shorthand is `none` (fill-mode), not `forwards`.
    expect(css).toMatch(/animation: fade 300ms linear 1 none;/);
    expect(css).not.toContain('forwards');
  });

  it('unions keyframe times across tracks, combines transform, and translates relative to 0%', () => {
    const css = cssKeyframesFor('move', multiAnim());

    // Stop union: 0, 150 (from x mid-keyframe), 400 -> 0%, 37.5%, 100%.
    expect(css).toContain('0% {');
    expect(css).toContain('37.5% {');
    expect(css).toContain('100% {');

    // 0% stop: translate is the RELATIVE delta from the base (0,0), rotation 0.
    // x/y absolute base is (100,50); delta at 0% is (0,0).
    expect(css).toContain('transform: translate(0px, 0px) rotate(0deg);');

    // 100% stop: x 200 - 100 = 100 delta, y 90 - 50 = 40 delta, rotate 90.
    // translate comes first, then rotate, in the SAME transform.
    expect(css).toContain('transform: translate(100px, 40px) rotate(90deg);');

    // opacity animated down to 0.
    expect(css).toContain('opacity: 0;');
  });

  it('emits width/height as px declarations', () => {
    const css = cssKeyframesFor('grow', {
      duration: 200,
      tracks: [
        {
          property: 'width',
          keyframes: [
            { time: 0, value: 0, easing: 'linear' },
            { time: 200, value: 120, easing: 'linear' },
          ],
        },
        {
          property: 'height',
          keyframes: [
            { time: 0, value: 0, easing: 'linear' },
            { time: 200, value: 60, easing: 'linear' },
          ],
        },
      ],
    });
    expect(css).toContain('width: 0px;');
    expect(css).toContain('width: 120px;');
    expect(css).toContain('height: 60px;');
  });

  it('passes each editor easing through verbatim as a CSS timing function', () => {
    const easings: Easing[] = ['linear', 'ease-in', 'ease-out', 'ease-in-out'];
    for (const easing of easings) {
      const anim: NodeAnimation = {
        duration: 100,
        tracks: [
          {
            property: 'opacity',
            keyframes: [
              { time: 0, value: 0, easing },
              { time: 100, value: 1, easing },
            ],
          },
        ],
      };
      const css = cssKeyframesFor('e', anim);
      expect(css).toContain(`animation: e 100ms ${easing} 1 none;`);
    }
  });
});

describe('waapiSnippetFor', () => {
  it('emits an element.animate call with fill none and relative transforms', () => {
    const snippet = waapiSnippetFor(multiAnim());
    expect(snippet).toContain('element.animate([');
    expect(snippet).toContain("fill: 'none'");
    expect(snippet).toContain('duration: 400');
    expect(snippet).toContain("easing: 'linear'");
    // offset-addressed frames; relative translate from base.
    expect(snippet).toContain('offset: 0');
    expect(snippet).toContain("transform: 'translate(0px, 0px) rotate(0deg)'");
    expect(snippet).toContain("transform: 'translate(100px, 40px) rotate(90deg)'");
    expect(snippet).toContain('offset: 1');
  });

  it('emits opacity for a single-track fade', () => {
    const snippet = waapiSnippetFor(fadeAnim());
    expect(snippet).toContain('opacity: 0');
    expect(snippet).toContain('opacity: 1');
  });
});
