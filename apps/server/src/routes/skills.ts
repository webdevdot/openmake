import { z } from 'zod';
import type { Prisma } from '@openmake/database';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { HttpError, parseOrThrow } from '../plugins/error-handler.js';
import { requireOrgRole } from '../plugins/auth.js';

const OrgIdParamsSchema = z.object({ orgId: z.string().min(1) });
const SkillIdParamsSchema = z.object({ orgId: z.string().min(1), skillId: z.string().min(1) });

const CreateSkillSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  systemPrompt: z.string().min(1),
  outputSchema: z.record(z.string(), z.unknown()).optional(),
  examples: z.unknown().optional(),
  toolPermissions: z.unknown().optional(),
});

const UpdateSkillSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  systemPrompt: z.string().min(1).optional(),
  outputSchema: z.record(z.string(), z.unknown()).optional(),
  examples: z.unknown().optional(),
  toolPermissions: z.unknown().optional(),
});

async function resolveOrgIdFromOrgParam(request: FastifyRequest): Promise<string | undefined> {
  const { orgId } = parseOrThrow(OrgIdParamsSchema, request.params);
  return orgId;
}

export async function skillRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/orgs/:orgId/skills',
    { preHandler: [app.authenticate, requireOrgRole('VIEWER', resolveOrgIdFromOrgParam)] },
    async (request) => {
      const { orgId } = parseOrThrow(OrgIdParamsSchema, request.params);
      const skills = await app.db.skills.listForOrg(orgId);
      return { skills };
    },
  );

  app.post(
    '/orgs/:orgId/skills',
    { preHandler: [app.authenticate, requireOrgRole('EDITOR', resolveOrgIdFromOrgParam)] },
    async (request, reply) => {
      const { orgId } = parseOrThrow(OrgIdParamsSchema, request.params);
      const body = parseOrThrow(CreateSkillSchema, request.body);
      const skill = await app.db.skills.create({
        orgId,
        ...body,
        outputSchema: body.outputSchema as Prisma.InputJsonValue | undefined,
        examples: body.examples as Prisma.InputJsonValue | undefined,
        toolPermissions: body.toolPermissions as Prisma.InputJsonValue | undefined,
      });
      reply.status(201);
      return { skill };
    },
  );

  app.patch(
    '/orgs/:orgId/skills/:skillId',
    { preHandler: [app.authenticate, requireOrgRole('EDITOR', resolveOrgIdFromOrgParam)] },
    async (request) => {
      const { orgId, skillId } = parseOrThrow(SkillIdParamsSchema, request.params);
      const body = parseOrThrow(UpdateSkillSchema, request.body);
      const existing = await app.db.skills.findById(skillId);
      // Ownership check: the skill must belong to the org in the URL (IDOR guard).
      if (!existing || existing.orgId !== orgId) {
        throw new HttpError(404, 'NOT_FOUND', 'Skill not found');
      }
      if (existing.builtIn) throw new HttpError(403, 'FORBIDDEN', 'Built-in skills are immutable');
      const skill = await app.db.skills.update(skillId, {
        ...body,
        outputSchema: body.outputSchema as Prisma.InputJsonValue | undefined,
        examples: body.examples as Prisma.InputJsonValue | undefined,
        toolPermissions: body.toolPermissions as Prisma.InputJsonValue | undefined,
      });
      return { skill };
    },
  );

  app.delete(
    '/orgs/:orgId/skills/:skillId',
    { preHandler: [app.authenticate, requireOrgRole('EDITOR', resolveOrgIdFromOrgParam)] },
    async (request, reply) => {
      const { orgId, skillId } = parseOrThrow(SkillIdParamsSchema, request.params);
      const existing = await app.db.skills.findById(skillId);
      // Ownership check: the skill must belong to the org in the URL (IDOR guard).
      if (!existing || existing.orgId !== orgId) {
        throw new HttpError(404, 'NOT_FOUND', 'Skill not found');
      }
      if (existing.builtIn) throw new HttpError(403, 'FORBIDDEN', 'Built-in skills are immutable');
      await app.db.skills.delete(skillId);
      reply.status(204);
    },
  );
}
