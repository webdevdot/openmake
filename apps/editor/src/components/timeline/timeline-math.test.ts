import { describe, expect, it } from 'vitest';
import { clampKeyframeTime, pxToTime, rulerTicks, timeToPx } from './timeline-math.js';

describe('timeToPx', () => {
  it('maps endpoints and midpoint linearly', () => {
    expect(timeToPx(0, 1000, 400)).toBe(0);
    expect(timeToPx(1000, 1000, 400)).toBe(400);
    expect(timeToPx(500, 1000, 400)).toBe(200);
  });

  it('clamps out-of-range times to the lane', () => {
    expect(timeToPx(-100, 1000, 400)).toBe(0);
    expect(timeToPx(2000, 1000, 400)).toBe(400);
  });

  it('returns 0 for a non-positive duration', () => {
    expect(timeToPx(500, 0, 400)).toBe(0);
  });
});

describe('pxToTime', () => {
  it('is the inverse of timeToPx at the endpoints and midpoint', () => {
    expect(pxToTime(0, 1000, 400)).toBe(0);
    expect(pxToTime(400, 1000, 400)).toBe(1000);
    expect(pxToTime(200, 1000, 400)).toBe(500);
  });

  it('clamps px outside the lane to [0, duration]', () => {
    expect(pxToTime(-50, 1000, 400)).toBe(0);
    expect(pxToTime(500, 1000, 400)).toBe(1000);
  });

  it('returns 0 for a non-positive width', () => {
    expect(pxToTime(200, 1000, 0)).toBe(0);
  });
});

describe('clampKeyframeTime', () => {
  const times = [0, 300, 600, 1000];
  const duration = 1000;

  it('keeps an interior keyframe strictly between its neighbors', () => {
    // Trying to drag kf index 1 past its right neighbor (600) is clamped to 600.
    expect(clampKeyframeTime(900, 1, times, duration)).toBe(600);
    // Dragging it left past its left neighbor (0) is clamped to 0.
    expect(clampKeyframeTime(-100, 1, times, duration)).toBe(0);
    // A legal move is returned unchanged.
    expect(clampKeyframeTime(450, 1, times, duration)).toBe(450);
  });

  it('pins the first keyframe to [0, next]', () => {
    expect(clampKeyframeTime(-50, 0, times, duration)).toBe(0);
    expect(clampKeyframeTime(500, 0, times, duration)).toBe(300);
  });

  it('pins the last keyframe to [prev, duration]', () => {
    expect(clampKeyframeTime(2000, 3, times, duration)).toBe(1000);
    expect(clampKeyframeTime(400, 3, times, duration)).toBe(600);
  });
});

describe('rulerTicks', () => {
  it('produces count+1 inclusive ticks', () => {
    expect(rulerTicks(1000, 4)).toEqual([0, 250, 500, 750, 1000]);
  });

  it('degenerates to a single 0 tick for invalid inputs', () => {
    expect(rulerTicks(0, 4)).toEqual([0]);
    expect(rulerTicks(1000, 0)).toEqual([0]);
  });
});
