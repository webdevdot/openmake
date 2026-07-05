import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    testTimeout: 20_000,
    hookTimeout: 30_000,
    // Tests share one Postgres database and truncate between runs, so files
    // must not execute concurrently against it.
    fileParallelism: false,
  },
});
