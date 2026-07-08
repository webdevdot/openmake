import type { CanvasKit } from 'canvaskit-wasm';

type CanvasKitInitFn = (opts?: { locateFile?: (file: string) => string }) => Promise<CanvasKit>;

export interface LoadCanvasKitOptions {
  /**
   * Maps a CanvasKit asset name (e.g. "canvaskit.wasm") to a fetchable URL.
   * Required in browsers under a bundler — pass the bundler's asset URL
   * (Vite: `import wasmUrl from 'canvaskit-wasm/bin/canvaskit.wasm?url'`).
   * In Node it defaults to resolving from the installed package.
   */
  locateFile?: (file: string) => string;
}

let cached: Promise<CanvasKit> | undefined;

/** Loads the process-wide CanvasKit WASM module exactly once. */
export function loadCanvasKit(opts?: LoadCanvasKitOptions): Promise<CanvasKit> {
  if (!cached) {
    cached = (async () => {
      if (typeof window === 'undefined') {
        // Node: resolve loader + wasm from the installed package. The dynamic
        // import keeps node:module out of browser bundles.
        const { createRequire } = await import('node:module');
        const require = createRequire(import.meta.url);
        const CanvasKitInit = require('canvaskit-wasm/bin/canvaskit.js') as CanvasKitInitFn;
        return CanvasKitInit({
          locateFile:
            opts?.locateFile ?? ((file: string) => require.resolve('canvaskit-wasm/bin/' + file)),
        });
      }
      // Browser: the JS half of CanvasKit is a normal dependency the bundler
      // handles; only the .wasm needs locating.
      const mod = (await import('canvaskit-wasm')) as unknown as {
        default: CanvasKitInitFn;
      };
      return mod.default({
        locateFile: opts?.locateFile ?? ((file: string) => '/' + file),
      });
    })();
  }
  return cached;
}

/** Test-only hook to inject a pre-built CanvasKit instance and skip the WASM load. */
export function setCachedCanvasKit(ck: CanvasKit): void {
  cached = Promise.resolve(ck);
}
