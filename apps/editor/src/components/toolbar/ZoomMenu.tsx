import { useEffect, useRef, useState } from 'react';
import { useCameraStore } from '../../store/camera.js';
import { clampZoom } from '../../canvas/camera.js';

const PRESETS = [25, 50, 100, 200, 400];

export function ZoomMenu() {
  const camera = useCameraStore((s) => s.camera);
  const setCamera = useCameraStore((s) => s.setCamera);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (containerRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const setZoomPercent = (percent: number) => {
    setCamera({ ...camera, zoom: clampZoom(percent / 100) });
    setOpen(false);
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        data-testid="zoom-menu-trigger"
        className="rounded px-2 py-1 text-xs bg-hover-app"
        onClick={() => setOpen((o) => !o)}
      >
        {Math.round(camera.zoom * 100)}%
      </button>
      {open && (
        <div
          className="absolute right-0 top-full z-10 mt-1 w-32 rounded border bg-panel py-1 border-app"
          data-testid="zoom-menu"
        >
          {PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              className="block w-full px-3 py-1 text-left text-xs bg-hover-app"
              onClick={() => setZoomPercent(p)}
            >
              {p}%
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
