import type YogaModule from 'yoga-layout';
import type * as YogaEnums from 'yoga-layout';

/**
 * The Yoga API surface this package uses: the default export's `Config`/`Node`
 * factories plus the enum namespaces, which yoga-layout exposes as separate
 * named exports (`Align`, `Justify`, `FlexDirection`, `Edge`, `Gutter`,
 * `Wrap`, ...) rather than as properties on the default object.
 */
export type Yoga = typeof YogaModule &
  Pick<typeof YogaEnums, 'Align' | 'Justify' | 'FlexDirection' | 'Edge' | 'Gutter' | 'Wrap'>;

/**
 * yoga-layout's default export resolves a WASM module via top-level await, so
 * importing it is inherently asynchronous. We cache the loaded instance after
 * the first successful dynamic import so repeated calls are free and
 * {@link getYoga} can stay synchronous.
 */
let yogaPromise: Promise<Yoga> | undefined;
let loadedYoga: Yoga | undefined;

/** Preload the Yoga WASM module. Safe to call multiple times; idempotent. */
export function initLayout(): Promise<Yoga> {
  if (!yogaPromise) {
    yogaPromise = import('yoga-layout').then((mod) => {
      const yoga: Yoga = {
        ...mod.default,
        Align: mod.Align,
        Justify: mod.Justify,
        FlexDirection: mod.FlexDirection,
        Edge: mod.Edge,
        Gutter: mod.Gutter,
        Wrap: mod.Wrap,
      };
      loadedYoga = yoga;
      return yoga;
    });
  }
  return yogaPromise;
}

/**
 * Synchronously access the already-loaded Yoga instance. Throws if
 * {@link initLayout} has not been awaited yet — callers must `await
 * initLayout()` once (e.g. at app startup) before calling {@link computeLayout}.
 */
export function getYoga(): Yoga {
  if (!loadedYoga) {
    throw new Error('@openmake/layout: call and await initLayout() before computeLayout()');
  }
  return loadedYoga;
}
