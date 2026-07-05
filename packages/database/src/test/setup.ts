import { execSync } from 'node:child_process';
import path from 'node:path';
import { Client } from 'pg';
import '../load-env.js';

const ROOT_URL = process.env.DATABASE_URL;
if (!ROOT_URL) {
  throw new Error('test setup: DATABASE_URL is not set (check the repo-root .env)');
}

const rootUrl = new URL(ROOT_URL);
const TEST_DB_NAME = 'openmake_test';

const testUrl = new URL(ROOT_URL);
testUrl.pathname = `/${TEST_DB_NAME}`;
export const TEST_DATABASE_URL = testUrl.toString();

/** Creates the `openmake_test` database if it doesn't already exist. */
async function ensureTestDatabase(): Promise<void> {
  const adminClient = new Client({ connectionString: rootUrl.toString() });
  await adminClient.connect();
  try {
    const { rows } = await adminClient.query('SELECT 1 FROM pg_database WHERE datname = $1', [
      TEST_DB_NAME,
    ]);
    if (rows.length === 0) {
      // Database identifiers can't be parameterized; TEST_DB_NAME is a fixed constant.
      await adminClient.query(`CREATE DATABASE ${TEST_DB_NAME}`);
    }
  } finally {
    await adminClient.end();
  }
}

/** Applies all migrations to the test database via the Prisma CLI. */
function applyMigrations(): void {
  const packageRoot = path.resolve(import.meta.dirname, '../..');
  execSync('npx prisma migrate deploy', {
    cwd: packageRoot,
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: 'pipe',
  });
}

let initialized: Promise<void> | undefined;

/** Ensures the isolated test database exists and is migrated. Safe to call repeatedly. */
export function setupTestDatabase(): Promise<void> {
  initialized ??= (async () => {
    await ensureTestDatabase();
    applyMigrations();
  })();
  return initialized;
}

const TABLES = [
  'audit_logs',
  'api_keys',
  'comments',
  'ai_messages',
  'ai_conversations',
  'ai_providers',
  'generated_code',
  'component_attachments',
  'workflows',
  'agents',
  'skills',
  'component_embeddings',
  'components',
  'doc_snapshots',
  'doc_updates',
  'files',
  'projects',
  'org_members',
  'organizations',
  'refresh_tokens',
  'users',
];

/** Truncates every application table, resetting identities, cascading FKs. */
export async function truncateAll(client: Client): Promise<void> {
  await client.query(`TRUNCATE TABLE ${TABLES.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`);
}
