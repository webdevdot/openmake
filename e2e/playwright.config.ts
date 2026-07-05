import { defineConfig } from '@playwright/test';

/**
 * Expects the stack to be running:
 *   docker compose up -d            (postgres, redis, minio)
 *   pnpm --filter @openmake/server start
 *   pnpm --filter @openmake/editor build && pnpm --filter @openmake/editor exec vite preview --port 5173
 * Override targets with E2E_WEB_URL / E2E_API_URL.
 */
export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  retries: 0,
  workers: 1,
  use: {
    baseURL: process.env.E2E_WEB_URL ?? 'http://localhost:5173',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  reporter: [['list']],
});
