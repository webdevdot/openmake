// Vitest global setup. Intentionally minimal: no jest-dom (not a listed
// dependency) — assertions use plain DOM/testing-library APIs.
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// `globals: false` means RTL's own auto-cleanup afterEach (which relies on
// the test framework registering globally) doesn't fire, so each render()
// would otherwise leak into the next test in the same file.
afterEach(() => {
  cleanup();
});
