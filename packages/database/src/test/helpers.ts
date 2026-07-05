import { Client } from 'pg';
import { Database } from '../database.js';
import { createPrismaClient } from '../client.js';
import { setupTestDatabase, TEST_DATABASE_URL, truncateAll } from './setup.js';

export interface TestContext {
  db: Database;
  teardown: () => Promise<void>;
}

/** Boots an isolated `Database` facade against the migrated test database. */
export async function createTestContext(): Promise<TestContext> {
  await setupTestDatabase();
  const prisma = createPrismaClient(TEST_DATABASE_URL);
  const db = new Database(prisma);
  return {
    db,
    teardown: () => db.disconnect(),
  };
}

/** Truncates all application tables via a fresh admin connection. */
export async function resetDatabase(): Promise<void> {
  const client = new Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();
  try {
    await truncateAll(client);
  } finally {
    await client.end();
  }
}
