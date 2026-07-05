import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { HttpError, parseOrThrow } from '../plugins/error-handler.js';
import { requireOrgRole } from '../plugins/auth.js';
import { sha256Hex } from '../services/auth-service.js';

const OrgIdParamsSchema = z.object({ orgId: z.string().min(1) });
const KeyIdParamsSchema = z.object({ orgId: z.string().min(1), keyId: z.string().min(1) });

const ALLOWED_SCOPES = ['mcp:read', 'mcp:write'] as const;
const ScopeEnum = z.enum(ALLOWED_SCOPES);

const CreateApiKeySchema = z.object({
  name: z.string().min(1),
  scopes: z.array(ScopeEnum).min(1),
});

async function resolveOrgIdFromOrgParam(request: FastifyRequest): Promise<string | undefined> {
  const { orgId } = parseOrThrow(OrgIdParamsSchema, request.params);
  return orgId;
}

interface SafeApiKeyView {
  id: string;
  name: string;
  scopes: string[];
  createdAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  expiresAt: Date | null;
}

function toSafeView(row: {
  id: string;
  name: string;
  scopes: string[];
  createdAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  expiresAt: Date | null;
}): SafeApiKeyView {
  return {
    id: row.id,
    name: row.name,
    scopes: row.scopes,
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt,
    revokedAt: row.revokedAt,
    expiresAt: row.expiresAt,
  };
}

export async function apiKeyRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/orgs/:orgId/api-keys',
    { preHandler: [app.authenticate, requireOrgRole('ADMIN', resolveOrgIdFromOrgParam)] },
    async (request) => {
      const { orgId } = parseOrThrow(OrgIdParamsSchema, request.params);
      const keys = await app.db.apiKeys.listForOrg(orgId);
      return { apiKeys: keys.map(toSafeView) };
    },
  );

  app.post(
    '/orgs/:orgId/api-keys',
    { preHandler: [app.authenticate, requireOrgRole('ADMIN', resolveOrgIdFromOrgParam)] },
    async (request, reply) => {
      const { orgId } = parseOrThrow(OrgIdParamsSchema, request.params);
      const body = parseOrThrow(CreateApiKeySchema, request.body);

      const plaintextKey = `om_${randomBytes(32).toString('base64url')}`;
      const keyHash = sha256Hex(plaintextKey);

      const key = await app.db.apiKeys.create({
        orgId,
        name: body.name,
        keyHash,
        scopes: body.scopes,
      });

      await app.db.audit.append({
        orgId,
        userId: request.user!.id,
        action: 'api_key.create',
        targetType: 'api_key',
        targetId: key.id,
      });

      reply.status(201);
      return { apiKey: { ...toSafeView(key), key: plaintextKey } };
    },
  );

  app.delete(
    '/orgs/:orgId/api-keys/:keyId',
    { preHandler: [app.authenticate, requireOrgRole('ADMIN', resolveOrgIdFromOrgParam)] },
    async (request, reply) => {
      const { orgId, keyId } = parseOrThrow(KeyIdParamsSchema, request.params);
      const existing = await app.db.apiKeys.findById(keyId);
      if (!existing || existing.orgId !== orgId) {
        throw new HttpError(404, 'NOT_FOUND', 'API key not found');
      }
      await app.db.apiKeys.revoke(keyId);

      await app.db.audit.append({
        orgId,
        userId: request.user!.id,
        action: 'api_key.revoke',
        targetType: 'api_key',
        targetId: keyId,
      });

      reply.status(204);
    },
  );
}
