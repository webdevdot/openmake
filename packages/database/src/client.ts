import { PrismaClient } from '../generated/client/index.js';

/** Creates a new Prisma client, optionally against a specific database URL. */
export function createPrismaClient(url?: string): PrismaClient {
  return new PrismaClient(
    url
      ? {
          datasources: { db: { url } },
        }
      : undefined,
  );
}

export type { PrismaClient };
