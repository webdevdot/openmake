import { z } from 'zod';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { HttpError, parseOrThrow } from '../plugins/error-handler.js';
import { requireOrgRole, resolveOrgIdFromProject } from '../plugins/auth.js';

const OrgIdParamsSchema = z.object({ orgId: z.string().min(1) });
const ProjectIdParamsSchema = z.object({ projectId: z.string().min(1) });
const CreateProjectSchema = z.object({ name: z.string().min(1), description: z.string().optional() });
const UpdateProjectSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
});

async function resolveOrgIdFromOrgParam(request: FastifyRequest): Promise<string | undefined> {
  const { orgId } = parseOrThrow(OrgIdParamsSchema, request.params);
  return orgId;
}

async function resolveOrgIdFromProjectParam(request: FastifyRequest): Promise<string | undefined> {
  const { projectId } = parseOrThrow(ProjectIdParamsSchema, request.params);
  return resolveOrgIdFromProject(request.server, projectId);
}

export async function projectRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/orgs/:orgId/projects',
    { preHandler: [app.authenticate, requireOrgRole('VIEWER', resolveOrgIdFromOrgParam)] },
    async (request) => {
      const projects = await app.db.projects.listByOrg(request.orgId!);
      return { projects };
    },
  );

  app.post(
    '/orgs/:orgId/projects',
    { preHandler: [app.authenticate, requireOrgRole('EDITOR', resolveOrgIdFromOrgParam)] },
    async (request, reply) => {
      const body = parseOrThrow(CreateProjectSchema, request.body);
      const project = await app.db.projects.create({
        orgId: request.orgId!,
        name: body.name,
        description: body.description,
      });
      reply.status(201);
      return { project };
    },
  );

  app.get(
    '/projects/:projectId',
    { preHandler: [app.authenticate, requireOrgRole('VIEWER', resolveOrgIdFromProjectParam)] },
    async (request) => {
      const { projectId } = parseOrThrow(ProjectIdParamsSchema, request.params);
      const project = await app.db.projects.findById(projectId);
      if (!project) throw new HttpError(404, 'NOT_FOUND', 'Project not found');
      return { project };
    },
  );

  app.patch(
    '/projects/:projectId',
    { preHandler: [app.authenticate, requireOrgRole('EDITOR', resolveOrgIdFromProjectParam)] },
    async (request) => {
      const { projectId } = parseOrThrow(ProjectIdParamsSchema, request.params);
      const body = parseOrThrow(UpdateProjectSchema, request.body);
      const project = await app.db.projects.update(projectId, body);
      return { project };
    },
  );

  app.delete(
    '/projects/:projectId',
    { preHandler: [app.authenticate, requireOrgRole('EDITOR', resolveOrgIdFromProjectParam)] },
    async (request, reply) => {
      const { projectId } = parseOrThrow(ProjectIdParamsSchema, request.params);
      await app.db.projects.delete(projectId);
      reply.status(204);
    },
  );
}
