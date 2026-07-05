import { z } from 'zod';
import type { Prisma } from '@openmake/database';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { HttpError, parseOrThrow } from '../plugins/error-handler.js';
import { requireOrgRole } from '../plugins/auth.js';

const OrgIdParamsSchema = z.object({ orgId: z.string().min(1) });
const AgentIdParamsSchema = z.object({ orgId: z.string().min(1), agentId: z.string().min(1) });

const ProviderEnum = z.enum(['OPENAI', 'ANTHROPIC', 'GOOGLE', 'LOCAL']);

const CreateAgentSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  provider: ProviderEnum,
  model: z.string().min(1),
  config: z.record(z.string(), z.unknown()).optional(),
  skillIds: z.array(z.string()).optional(),
});

const UpdateAgentSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  provider: ProviderEnum.optional(),
  model: z.string().min(1).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});

const SetSkillsSchema = z.object({ skillIds: z.array(z.string()) });

async function resolveOrgIdFromOrgParam(request: FastifyRequest): Promise<string | undefined> {
  const { orgId } = parseOrThrow(OrgIdParamsSchema, request.params);
  return orgId;
}

export async function agentRoutes(app: FastifyInstance): Promise<void> {
  /** 404s unless the agent belongs to the org in the URL (IDOR guard). */
  const assertAgentOwned = async (agentId: string, orgId: string): Promise<void> => {
    const agent = await app.db.agents.findById(agentId);
    if (!agent || agent.orgId !== orgId) throw new HttpError(404, 'NOT_FOUND', 'Agent not found');
  };

  app.get(
    '/orgs/:orgId/agents',
    { preHandler: [app.authenticate, requireOrgRole('VIEWER', resolveOrgIdFromOrgParam)] },
    async (request) => {
      const { orgId } = parseOrThrow(OrgIdParamsSchema, request.params);
      const agents = await app.db.agents.listForOrg(orgId);
      return { agents };
    },
  );

  app.post(
    '/orgs/:orgId/agents',
    { preHandler: [app.authenticate, requireOrgRole('EDITOR', resolveOrgIdFromOrgParam)] },
    async (request, reply) => {
      const { orgId } = parseOrThrow(OrgIdParamsSchema, request.params);
      const body = parseOrThrow(CreateAgentSchema, request.body);
      const agent = await app.db.agents.create({
        orgId,
        ...body,
        config: body.config as Prisma.InputJsonValue | undefined,
      });
      reply.status(201);
      return { agent };
    },
  );

  app.get(
    '/orgs/:orgId/agents/:agentId',
    { preHandler: [app.authenticate, requireOrgRole('VIEWER', resolveOrgIdFromOrgParam)] },
    async (request) => {
      const { orgId, agentId } = parseOrThrow(AgentIdParamsSchema, request.params);
      const agent = await app.db.agents.findById(agentId);
      if (!agent || agent.orgId !== orgId) throw new HttpError(404, 'NOT_FOUND', 'Agent not found');
      return { agent };
    },
  );

  app.patch(
    '/orgs/:orgId/agents/:agentId',
    { preHandler: [app.authenticate, requireOrgRole('EDITOR', resolveOrgIdFromOrgParam)] },
    async (request) => {
      const { orgId, agentId } = parseOrThrow(AgentIdParamsSchema, request.params);
      await assertAgentOwned(agentId, orgId);
      const body = parseOrThrow(UpdateAgentSchema, request.body);
      const agent = await app.db.agents.update(agentId, {
        ...body,
        config: body.config as Prisma.InputJsonValue | undefined,
      });
      return { agent };
    },
  );

  app.put(
    '/orgs/:orgId/agents/:agentId/skills',
    { preHandler: [app.authenticate, requireOrgRole('EDITOR', resolveOrgIdFromOrgParam)] },
    async (request) => {
      const { orgId, agentId } = parseOrThrow(AgentIdParamsSchema, request.params);
      await assertAgentOwned(agentId, orgId);
      const body = parseOrThrow(SetSkillsSchema, request.body);
      // Referenced skills must be owned by the org or built-in (IDOR guard).
      for (const skillId of body.skillIds) {
        const skill = await app.db.prisma.skill.findFirst({
          where: { id: skillId, OR: [{ orgId }, { builtIn: true }] },
          select: { id: true },
        });
        if (!skill) throw new HttpError(404, 'NOT_FOUND', `Skill "${skillId}" not found`);
      }
      const agent = await app.db.agents.setSkills(agentId, body.skillIds);
      return { agent };
    },
  );

  app.delete(
    '/orgs/:orgId/agents/:agentId',
    { preHandler: [app.authenticate, requireOrgRole('EDITOR', resolveOrgIdFromOrgParam)] },
    async (request, reply) => {
      const { orgId, agentId } = parseOrThrow(AgentIdParamsSchema, request.params);
      await assertAgentOwned(agentId, orgId);
      await app.db.agents.delete(agentId);
      reply.status(204);
    },
  );
}
