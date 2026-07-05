import { createRequire } from 'node:module';
import type { CanvasKit } from 'canvaskit-wasm';

type CanvasKitInitFn = (opts?: { locateFile?: (file: string) => string }) => Promise<CanvasKit>;

let cached: Promise<CanvasKit> | undefined;

/**
 * Loads the process-wide CanvasKit WASM module exactly once. Node and browser
 * both resolve `canvaskit-wasm/bin/canvaskit.wasm` relative to the package;
 * in Node we do that via `createRequire` since this module is ESM.
 */
export function loadCanvasKit(): Promise<CanvasKit> {
  if (!cached) {
    cached = (async () => {
      const require = createRequire(import.meta.url);
      const CanvasKitInit = require('canvaskit-wasm/bin/canvaskit.js') as CanvasKitInitFn;
      return CanvasKitInit({
        locateFile: (file: string) => require.resolve('canvaskit-wasm/bin/' + file),
      });
    })();
  }
  return cached;
}

/** Test-only hook to inject a pre-built CanvasKit instance and skip the WASM load. */
export function setCachedCanvasKit(ck: CanvasKit): void {
  cached = Promise.resolve(ck);
}
