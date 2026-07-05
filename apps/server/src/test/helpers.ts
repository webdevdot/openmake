import type { FastifyInstance } from 'fastify';
import { Database, createPrismaClient } from '@openmake/database';
import { buildApp } from '../app.js';
import type { Config } from '../config.js';
import { setupTestDatabase, TEST_DATABASE_URL } from './db-setup.js';

const TEST_JWT_SECRET = 'test-jwt-secret-for-openmake-server-tests-only';
const TEST_MASTER_KEY = 'a'.repeat(64);

export interface TestApp {
  app: FastifyInstance;
  db: Database;
  config: Config;
  teardown: () => Promise<void>;
}

function testConfig(): Config {
  return {
    databaseUrl: TEST_DATABASE_URL,
    redisUrl: undefined,
    jwtSecret: TEST_JWT_SECRET,
    masterEncryptionKey: TEST_MASTER_KEY,
    corsOrigins: ['http://localhost:3000'],
    port: 0,
    isProd: false,
  };
}

/** Builds a Fastify app wired to the isolated `openmake_test` database. */
export async function buildTestApp(): Promise<TestApp> {
  await setupTestDatabase();
  const config = testConfig();
  const db = new Database(createPrismaClient(config.databaseUrl));
  const app = await buildApp(config, { db, logger: false });
  await app.ready();

  return {
    app,
    db,
    config,
    teardown: async () => {
      await app.close();
      await db.disconnect();
    },
  };
}
