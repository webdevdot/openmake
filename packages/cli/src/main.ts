#!/usr/bin/env -S npx tsx
import { run } from './index.js';

run(process.argv.slice(2))
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err) => {
    process.stderr.write(`Unexpected error: ${(err as Error).stack ?? err}\n`);
    process.exitCode = 1;
  });
