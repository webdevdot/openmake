import fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import cookie from '@fastify/cookie';
import websocket from '@fastify/websocket';
import { Database, createPrismaClient } from '@openmake/database';
import { DocSyncHub } from '@openmake/collab/server';
import type { Config } from './config.js';
import { registerErrorHandler } from './plugins/error-handler.js';
import { registerAuthPlugin } from './plugins/auth.js';
import { PgDocPersistence } from './adapters/pg-doc-persistence.js';
import { MinioAssetStore, type AssetStore } from './services/asset-store.js';
import { authRoutes } from './routes/auth.js';
import { orgRoutes } from './routes/orgs.js';
import { projectRoutes } from './routes/projects.js';
import { fileRoutes } from './routes/files.js';
import { syncRoutes } from './routes/sync.js';
import { skillRoutes } from './routes/skills.js';
import { agentRoutes } from './routes/agents.js';
import { workflowRoutes } from './routes/workflows.js';
import { providerRoutes } from './routes/providers.js';
import { componentRoutes } from './routes/components.js';
import { aiRoutes } from './routes/ai.js';
import { apiKeyRoutes } from './routes/api-keys.js';
import { commentRoutes } from './routes/comments.js';
import { healthRoutes } from './routes/health.js';
import { mcpRoutes } from './routes/mcp.js';

declare module 'fastify' {
  interface FastifyInstance {
    config: Config;
    db: Database;
    docSyncHub: DocSyncHub;
    assetStore: AssetStore;
  }
}

export interface BuildAppOptions {
  db?: Database;
  logger?: boolean;
  /** Injectable object store — tests pass an in-memory fake; prod uses MinIO. */
  assetStore?: AssetStore;
}

/** Builds a fully-wired, injectable Fastify instance. Does not call listen(). */
export async function buildApp(
  config: Config,
  opts: BuildAppOptions = {},
): Promise<FastifyInstance> {
  const app = fastify({
    logger: opts.logger ?? true,
  });

  const db = opts.db ?? new Database(createPrismaClient(config.databaseUrl));
  const docSyncHub = new DocSyncHub(new PgDocPersistence(db));
  const assetStore = opts.assetStore ?? new MinioAssetStore(config.s3);

  app.decorate('config', config);
  app.decorate('db', db);
  app.decorate('docSyncHub', docSyncHub);
  app.decorate('assetStore', assetStore);

  app.addHook('onClose', async () => {
    await docSyncHub.destroy();
  });

  // Create-if-missing the asset bucket on startup. A store that can't reach its
  // backend shouldn't crash the whole server — the asset routes surface the
  // failure per-request — so log and continue.
  app.addHook('onReady', async () => {
    try {
      await assetStore.ensureBucket();
    } catch (err) {
      app.log.warn({ err }, 'asset store: failed to ensure bucket on startup');
    }
  });

  // Tolerate empty JSON bodies (POST /auth/refresh, /auth/logout send none);
  // Fastify's default parser rejects them with FST_ERR_CTP_EMPTY_JSON_BODY.
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    if (body === '' || body === undefined) {
      done(null, {});
      return;
    }
    try {
      done(null, JSON.parse(body as string));
    } catch (err) {
      done(err as Error, undefined);
    }
  });

  // Raw-bytes parser for image asset uploads (PUT /files/:fileId/assets/:hash).
  // The per-route bodyLimit caps the size; here we just hand the route the Buffer.
  app.addContentTypeParser(
    ['image/png', 'image/jpeg'],
    { parseAs: 'buffer' },
    (_req, body, done) => {
      done(null, body);
    },
  );

  await app.register(helmet);
  await app.register(cors, {
    origin: config.corsOrigins.length > 0 ? config.corsOrigins : false,
    credentials: true,
    // @fastify/cors defaults `methods` to 'GET,HEAD,POST' — which silently
    // blocks the cross-origin preflight for every PUT/PATCH/DELETE route the
    // editor calls (file rename/delete, org/project/member updates, and the
    // image-asset upload). Enumerate the methods the API actually serves.
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE'],
  });
  await app.register(cookie);
  await app.register(rateLimit, { max: 200, timeWindow: '1 minute' });
  // Cap WS frame size (DoS guard) — the hub also rejects oversized sync frames.
  await app.register(websocket, { options: { maxPayload: 4 * 1024 * 1024 } });

  registerErrorHandler(app);
  registerAuthPlugin(app);

  const v1Prefix = '/api/v1';
  await app.register(authRoutes, { prefix: v1Prefix });
  await app.register(orgRoutes, { prefix: v1Prefix });
  await app.register(projectRoutes, { prefix: v1Prefix });
  await app.register(fileRoutes, { prefix: v1Prefix });
  await app.register(skillRoutes, { prefix: v1Prefix });
  await app.register(agentRoutes, { prefix: v1Prefix });
  await app.register(workflowRoutes, { prefix: v1Prefix });
  await app.register(providerRoutes, { prefix: v1Prefix });
  await app.register(componentRoutes, { prefix: v1Prefix });
  await app.register(aiRoutes, { prefix: v1Prefix });
  await app.register(apiKeyRoutes, { prefix: v1Prefix });
  await app.register(commentRoutes, { prefix: v1Prefix });

  await app.register(syncRoutes);
  await app.register(mcpRoutes);
  await app.register(healthRoutes);

  return app;
}
