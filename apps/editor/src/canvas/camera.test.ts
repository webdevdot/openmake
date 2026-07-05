import { describe, expect, it } from 'vitest';
import { clampZoom, fitBounds, panBy, screenToWorld, worldToScreen, zoomAt, zoomByFactor } from './camera.js';

describe('camera', () => {
  it('round-trips screen <-> world at identity camera', () => {
    const camera = { x: 0, y: 0, zoom: 1 };
    const world = screenToWorld(camera, { x: 100, y: 50 });
    expect(world).toEqual({ x: 100, y: 50 });
    expect(worldToScreen(camera, world)).toEqual({ x: 100, y: 50 });
  });

  it('round-trips screen <-> world with pan and zoom', () => {
    const camera = { x: 20, y: 30, zoom: 2 };
    const screen = { x: 150, y: 80 };
    const world = screenToWorld(camera, screen);
    const back = worldToScreen(camera, world);
    expect(back.x).toBeCloseTo(screen.x);
    expect(back.y).toBeCloseTo(screen.y);
  });

  it('clamps zoom to the min/max bounds', () => {
    expect(clampZoom(0)).toBeGreaterThan(0);
    expect(clampZoom(100000)).toBeLessThanOrEqual(256);
    expect(clampZoom(1)).toBe(1);
  });

  it('panBy moves the camera opposite the screen delta, scaled by zoom', () => {
    const camera = { x: 0, y: 0, zoom: 2 };
    const next = panBy(camera, { x: 20, y: 10 });
    expect(next.x).toBeCloseTo(-10);
    expect(next.y).toBeCloseTo(-5);
  });

  it('zoomAt keeps the world point under the anchor fixed on screen', () => {
    const camera = { x: 10, y: 10, zoom: 1 };
    const anchor = { x: 200, y: 100 };
    const worldBefore = screenToWorld(camera, anchor);
    const next = zoomAt(camera, anchor, 4);
    const worldAfter = screenToWorld(next, anchor);
    expect(worldAfter.x).toBeCloseTo(worldBefore.x);
    expect(worldAfter.y).toBeCloseTo(worldBefore.y);
    expect(next.zoom).toBe(4);
  });

  it('zoomByFactor multiplies zoom by the given factor', () => {
    const camera = { x: 0, y: 0, zoom: 1 };
    const next = zoomByFactor(camera, { x: 0, y: 0 }, 2);
    expect(next.zoom).toBe(2);
  });

  it('fitBounds centers and scales to fit within the viewport', () => {
    const bounds = { x: 0, y: 0, width: 100, height: 100 };
    const viewport = { width: 200, height: 200 };
    const camera = fitBounds(bounds, viewport, 0);
    expect(camera.zoom).toBeCloseTo(2);
    // world center (50,50) should map to screen center (100,100)
    const screenCenter = worldToScreen(camera, { x: 50, y: 50 });
    expect(screenCenter.x).toBeCloseTo(100);
    expect(screenCenter.y).toBeCloseTo(100);
  });
});
