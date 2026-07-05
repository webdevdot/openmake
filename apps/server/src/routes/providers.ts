import { z } from 'zod';
import { encryptSecret } from '@openmake/ai';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { HttpError, parseOrThrow } from '../plugins/error-handler.js';
import { requireOrgRole } from '../plugins/auth.js';

const OrgIdParamsSchema = z.object({ orgId: z.string().min(1) });
const ProviderEnum = z.enum(['OPENAI', 'ANTHROPIC', 'GOOGLE', 'LOCAL']);
const ProviderParamsSchema = z.object({ orgId: z.string().min(1), provider: ProviderEnum });

const PutProviderSchema = z.object({
  apiKey: z.string().min(1),
  baseUrl: z.string().optional(),
});

async function resolveOrgIdFromOrgParam(request: FastifyRequest): Promise<string | undefined> {
  const { orgId } = parseOrThrow(OrgIdParamsSchema, request.params);
  return orgId;
}

interface SafeProviderView {
  provider: string;
  hasKey: boolean;
  baseUrl: string | null;
  enabled: boolean;
}

function toSafeView(row: { provider: string; baseUrl: string | null; enabled: boolean }): SafeProviderView {
  return {
    provider: row.provider,
    hasKey: true,
    baseUrl: row.baseUrl,
    enabled: row.enabled,
  };
}

export async function providerRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/orgs/:orgId/providers',
    { preHandler: [app.authenticate, requireOrgRole('ADMIN', resolveOrgIdFromOrgParam)] },
    async (request) => {
      const { orgId } = parseOrThrow(OrgIdParamsSchema, request.params);
      const providers = await app.db.aiProviders.listForOrg(orgId);
      return { providers: providers.map(toSafeView) };
    },
  );

  app.put(
    '/orgs/:orgId/providers/:provider',
    { preHandler: [app.authenticate, requireOrgRole('ADMIN', resolveOrgIdFromOrgParam)] },
    async (request) => {
      const { orgId, provider } = parseOrThrow(ProviderParamsSchema, request.params);
      const body = parseOrThrow(PutProviderSchema, request.body);
      const encryptedKey = encryptSecret(body.apiKey, app.config.masterEncryptionKey);
      const saved = await app.db.aiProviders.upsert({
        orgId,
        provider,
        encryptedKey,
        baseUrl: body.baseUrl,
      });

      await app.db.audit.append({
        orgId,
        userId: request.user!.id,
        action: 'provider.set',
        targetType: 'ai_provider',
        targetId: saved.id,
        detail: { provider },
      });

      return { provider: toSafeView(saved) };
    },
  );

  app.delete(
    '/orgs/:orgId/providers/:provider',
    { preHandler: [app.authenticate, requireOrgRole('ADMIN', resolveOrgIdFromOrgParam)] },
    async (request, reply) => {
      const { orgId, provider } = parseOrThrow(ProviderParamsSchema, request.params);
      const existing = await app.db.aiProviders.findForOrg(orgId, provider);
      if (!existing) throw new HttpError(404, 'NOT_FOUND', 'Provider not configured');
      await app.db.aiProviders.delete(orgId, provider);
      reply.status(204);
    },
  );
}
