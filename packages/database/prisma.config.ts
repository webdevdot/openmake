import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import { defineConfig, env } from 'prisma/config';

// The monorepo keeps a single .env at the repo root; load it explicitly
// since Prisma no longer auto-loads .env files.
loadEnv({ path: path.resolve(import.meta.dirname, '../../.env') });

type Env = {
  DATABASE_URL: string;
};

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: env<Env>('DATABASE_URL'),
  },
});
