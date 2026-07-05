import { createHash } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createOpenmakeMcpServer } from '@openmake/mcp';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { PgDocumentStore, ReadOnlyDocumentStore } from '../adapters/pg-document-store.js';
import {
  PgIntelligenceStore,
  ReadOnlyIntelligenceStore,
} from '../adapters/pg-intelligence-store.js';

const READ_SCOPE = 'mcp:read';
const WRITE_SCOPE = 'mcp:write';

function unauthorized(reply: FastifyReply, message: string): void {
  reply.status(401).send({ error: { code: 'UNAUTHORIZED', message } });
}

function forbidden(reply: FastifyReply, message: string): void {
  reply.status(403).send({ error: { code: 'FORBIDDEN', message } });
}

export async function mcpRoutes(app: FastifyInstance): Promise<void> {
  app.post('/mcp', async (request, reply) => {
    const authHeader = request.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice('Bearer '.length).trim() : undefined;
    if (!token || !token.startsWith('om_')) {
      unauthorized(reply, 'Missing or malformed API key');
      return;
    }

    const keyHash = createHash('sha256').update(token).digest('hex');
    const key = await app.db.apiKeys.findActiveByHash(keyHash);
    if (!key) {
      unauthorized(reply, 'Invalid, revoked, or expired API key');
      return;
    }
    void app.db.apiKeys.touchLastUsed(key.id);

    if (!key.scopes.includes(READ_SCOPE)) {
      forbidden(reply, `API key is missing required scope: ${READ_SCOPE}`);
      return;
    }

    const canWrite = key.scopes.includes(WRITE_SCOPE);
    const documentStoreImpl = new PgDocumentStore(app.db, key.orgId);
    const documents = canWrite ? documentStoreImpl : new ReadOnlyDocumentStore(documentStoreImpl);
    const intelligenceImpl = new PgIntelligenceStore(app.db, key.orgId);
    const intelligence = canWrite
      ? intelligenceImpl
      : new ReadOnlyIntelligenceStore(intelligenceImpl);

    const server = createOpenmakeMcpServer({ documents, intelligence });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

    reply.hijack();

    request.raw.on('close', () => {
      void transport.close();
      void server.close();
    });

    await server.connect(transport);
    await transport.handleRequest(request.raw, reply.raw, request.body);
  });

  app.get('/mcp', async (_request, reply) => {
    reply.hijack();
    reply.raw.writeHead(405, { 'content-type': 'application/json' }).end(
      JSON.stringify({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Method not allowed.' },
        id: null,
      }),
    );
  });

  app.delete('/mcp', async (_request, reply) => {
    reply.hijack();
    reply.raw.writeHead(405, { 'content-type': 'application/json' }).end(
      JSON.stringify({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Method not allowed.' },
        id: null,
      }),
    );
  });
}
