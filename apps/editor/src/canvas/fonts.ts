import { registerFont } from '@openmake/renderer';
import interRegularUrl from '../assets/fonts/Inter-Regular.ttf?url';
import interBoldUrl from '../assets/fonts/Inter-Bold.ttf?url';

let loaded: Promise<void> | null = null;

/** Fetches and registers the bundled Inter weights with CanvasKit. Idempotent. */
export function loadEditorFonts(): Promise<void> {
  if (!loaded) {
    loaded = Promise.all([
      fetch(interRegularUrl).then((r) => r.arrayBuffer()),
      fetch(interBoldUrl).then((r) => r.arrayBuffer()),
    ]).then(([regular, bold]) => {
      registerFont(new Uint8Array(regular), 'Inter');
      registerFont(new Uint8Array(bold), 'Inter');
    });
  }
  return loaded;
}
