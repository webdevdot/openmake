import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/client/client.js';

/** Creates a new Prisma client backed by the `pg` driver adapter. */
export function createPrismaClient(url?: string): PrismaClient {
  const connectionString = url ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('createPrismaClient: no DATABASE_URL provided or set in the environment');
  }
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

export type { PrismaClient };
