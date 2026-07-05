import wasmUrl from 'canvaskit-wasm/bin/canvaskit.wasm?url';
import { loadCanvasKit } from '@openmake/renderer';

/**
 * Primes the process-wide CanvasKit loader with Vite's bundled WASM URL.
 * loadCanvasKit caches its promise, so importing this module anywhere before
 * a renderer is created guarantees the browser build never falls back to the
 * Node resolution path.
 */
export const canvasKitReady = loadCanvasKit({ locateFile: () => wasmUrl });
