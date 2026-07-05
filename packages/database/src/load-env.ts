import path from 'node:path';
import { config as loadEnv } from 'dotenv';

// The monorepo keeps a single .env at the repo root, two levels up from
// this package. Scripts run outside the Prisma CLI (seed, tests) need to
// load it explicitly since nothing else does so for them.
loadEnv({ path: path.resolve(import.meta.dirname, '../../../.env') });
