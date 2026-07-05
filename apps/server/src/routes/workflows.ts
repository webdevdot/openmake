import { z } from 'zod';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { HttpError, parseOrThrow } from '../plugins/error-handler.js';
import { requireOrgRole } from '../plugins/auth.js';

const OrgIdParamsSchema = z.object({ orgId: z.string().min(1) });
const WorkflowIdParamsSchema = z.object({ orgId: z.string().min(1), workflowId: z.string().min(1) });

const StepSchema = z.object({ agentId: z.string().min(1), instructions: z.string().optional() });

const CreateWorkflowSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  definition: z.array(StepSchema),
});

const UpdateWorkflowSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  definition: z.array(StepSchema).optional(),
});

async function resolveOrgIdFromOrgParam(request: FastifyRequest): Promise<string | undefined> {
  const { orgId } = parseOrThrow(OrgIdParamsSchema, request.params);
  return orgId;
}

export async function workflowRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/orgs/:orgId/workflows',
    { preHandler: [app.authenticate, requireOrgRole('VIEWER', resolveOrgIdFromOrgParam)] },
    async (request) => {
      const { orgId } = parseOrThrow(OrgIdParamsSchema, request.params);
      const workflows = await app.db.workflows.listForOrg(orgId);
      return { workflows };
    },
  );

  app.post(
    '/orgs/:orgId/workflows',
    { preHandler: [app.authenticate, requireOrgRole('EDITOR', resolveOrgIdFromOrgParam)] },
    async (request, reply) => {
      const { orgId } = parseOrThrow(OrgIdParamsSchema, request.params);
      const body = parseOrThrow(CreateWorkflowSchema, request.body);
      const workflow = await app.db.workflows.create({
        orgId,
        name: body.name,
        description: body.description,
        definition: body.definition,
      });
      reply.status(201);
      return { workflow };
    },
  );

  app.get(
    '/orgs/:orgId/workflows/:workflowId',
    { preHandler: [app.authenticate, requireOrgRole('VIEWER', resolveOrgIdFromOrgParam)] },
    async (request) => {
      const { workflowId } = parseOrThrow(WorkflowIdParamsSchema, request.params);
      const workflow = await app.db.workflows.findById(workflowId);
      if (!workflow) throw new HttpError(404, 'NOT_FOUND', 'Workflow not found');
      return { workflow };
    },
  );

  app.patch(
    '/orgs/:orgId/workflows/:workflowId',
    { preHandler: [app.authenticate, requireOrgRole('EDITOR', resolveOrgIdFromOrgParam)] },
    async (request) => {
      const { workflowId } = parseOrThrow(WorkflowIdParamsSchema, request.params);
      const body = parseOrThrow(UpdateWorkflowSchema, request.body);
      const workflow = await app.db.workflows.update(workflowId, body);
      return { workflow };
    },
  );

  app.delete(
    '/orgs/:orgId/workflows/:workflowId',
    { preHandler: [app.authenticate, requireOrgRole('EDITOR', resolveOrgIdFromOrgParam)] },
    async (request, reply) => {
      const { workflowId } = parseOrThrow(WorkflowIdParamsSchema, request.params);
      await app.db.workflows.delete(workflowId);
      reply.status(204);
    },
  );
}
