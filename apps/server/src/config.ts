import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

// The monorepo keeps a single .env at the repo root, two levels up from
// this package's src/ directory.
loadEnv({ path: path.resolve(import.meta.dirname, '../../../.env') });

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().optional(),
  JWT_SECRET: z.string().min(1, 'JWT_SECRET is required'),
  MASTER_ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, 'MASTER_ENCRYPTION_KEY must be 64 hex characters (32 bytes)'),
  CORS_ORIGINS: z.string().optional().default(''),
  SERVER_PORT: z.coerce.number().int().positive().optional().default(8080),
  NODE_ENV: z.string().optional().default('development'),
});

export interface Config {
  databaseUrl: string;
  redisUrl: string | undefined;
  jwtSecret: string;
  masterEncryptionKey: string;
  corsOrigins: string[];
  port: number;
  isProd: boolean;
}

/** Parses and validates process.env into a typed Config, failing fast on missing secrets. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const message = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
    throw new Error(`Invalid environment configuration: ${message}`);
  }
  const data = parsed.data;
  return {
    databaseUrl: data.DATABASE_URL,
    redisUrl: data.REDIS_URL,
    jwtSecret: data.JWT_SECRET,
    masterEncryptionKey: data.MASTER_ENCRYPTION_KEY,
    corsOrigins: data.CORS_ORIGINS.split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0),
    port: data.SERVER_PORT,
    isProd: data.NODE_ENV === 'production',
  };
}
