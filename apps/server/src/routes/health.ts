import type { FastifyInstance } from 'fastify';

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/healthz', async (_request, reply) => {
    try {
      await app.db.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', db: 'up' };
    } catch (error) {
      app.log.error(error);
      reply.status(503);
      return { status: 'error', db: 'down' };
    }
  });
}
