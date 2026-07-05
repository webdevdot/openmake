import type { Vec2 } from '@openmake/shared';

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export const DEFAULT_CAMERA: Camera = { x: 0, y: 0, zoom: 1 };

export const MIN_ZOOM = 0.02;
export const MAX_ZOOM = 256;

export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

/** Screen-space (canvas pixel) point → world-space (document) point. */
export function screenToWorld(camera: Camera, screen: Vec2): Vec2 {
  return {
    x: screen.x / camera.zoom + camera.x,
    y: screen.y / camera.zoom + camera.y,
  };
}

/** World-space point → screen-space (canvas pixel) point. */
export function worldToScreen(camera: Camera, world: Vec2): Vec2 {
  return {
    x: (world.x - camera.x) * camera.zoom,
    y: (world.y - camera.y) * camera.zoom,
  };
}

/** Pan the camera by a screen-space delta (e.g. from a wheel/drag gesture). */
export function panBy(camera: Camera, screenDelta: Vec2): Camera {
  return {
    ...camera,
    x: camera.x - screenDelta.x / camera.zoom,
    y: camera.y - screenDelta.y / camera.zoom,
  };
}

/**
 * Zoom towards a screen-space anchor point (e.g. the cursor), keeping the
 * world point currently under the anchor fixed on screen.
 */
export function zoomAt(camera: Camera, anchor: Vec2, newZoom: number): Camera {
  const clamped = clampZoom(newZoom);
  const worldAtAnchor = screenToWorld(camera, anchor);
  return {
    zoom: clamped,
    x: worldAtAnchor.x - anchor.x / clamped,
    y: worldAtAnchor.y - anchor.y / clamped,
  };
}

/** Multiplicative zoom step, e.g. from cmd/ctrl+wheel (deltaY) or +/- keys. */
export function zoomByFactor(camera: Camera, anchor: Vec2, factor: number): Camera {
  return zoomAt(camera, anchor, camera.zoom * factor);
}

/** Camera that fits `bounds` (world space) within `viewport` (screen px), with padding. */
export function fitBounds(
  bounds: { x: number; y: number; width: number; height: number },
  viewport: { width: number; height: number },
  padding = 64,
): Camera {
  const availW = Math.max(1, viewport.width - padding * 2);
  const availH = Math.max(1, viewport.height - padding * 2);
  const zoom = clampZoom(
    bounds.width <= 0 || bounds.height <= 0
      ? 1
      : Math.min(availW / bounds.width, availH / bounds.height),
  );
  const cx = bounds.x + bounds.width / 2;
  const cy = bounds.y + bounds.height / 2;
  return {
    zoom,
    x: cx - viewport.width / 2 / zoom,
    y: cy - viewport.height / 2 / zoom,
  };
}
