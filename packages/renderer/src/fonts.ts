import type { CanvasKit, TypefaceFontProvider } from 'canvaskit-wasm';

interface RegisteredFont {
  bytes: Uint8Array;
  family: string;
}

/** Module-level font store shared by every renderer instance in this process. */
const registeredFonts: RegisteredFont[] = [];
const registeredFamilies = new Set<string>();

/** Register font bytes under a family name so TEXT nodes using it can be drawn. */
export function registerFont(bytes: Uint8Array, family: string): void {
  registeredFonts.push({ bytes, family });
  registeredFamilies.add(family);
}

export function isFontRegistered(family: string): boolean {
  return registeredFamilies.has(family);
}

/** Test-only hook to reset the module-level store between test files. */
export function clearRegisteredFonts(): void {
  registeredFonts.length = 0;
  registeredFamilies.clear();
}

let cachedProvider: { ck: CanvasKit; provider: TypefaceFontProvider; count: number } | undefined;

/**
 * Builds (and caches) a TypefaceFontProvider containing every font registered
 * so far. Rebuilt lazily whenever a new font is registered after the cache
 * was created.
 */
export function getFontProvider(ck: CanvasKit): TypefaceFontProvider {
  if (
    cachedProvider &&
    cachedProvider.ck === ck &&
    cachedProvider.count === registeredFonts.length
  ) {
    return cachedProvider.provider;
  }
  const provider = ck.TypefaceFontProvider.Make();
  for (const font of registeredFonts) provider.registerFont(font.bytes, font.family);
  cachedProvider = { ck, provider, count: registeredFonts.length };
  return provider;
}
