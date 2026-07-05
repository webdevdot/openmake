import { z } from 'zod';
import { buildDesignContext } from '@openmake/ai';
import type { Prisma } from '@openmake/database';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { HttpError, parseOrThrow } from '../plugins/error-handler.js';
import { requireOrgRole, resolveOrgIdFromFile } from '../plugins/auth.js';
import { loadOpenDoc } from '../services/doc-service.js';

const FileIdParamsSchema = z.object({ fileId: z.string().min(1) });
const NodeParamsSchema = z.object({ fileId: z.string().min(1), nodeId: z.string().min(1) });

const AttachmentSchema = z.object({
  skillId: z.string().optional(),
  agentId: z.string().optional(),
  workflowId: z.string().optional(),
  prompts: z.unknown().optional(),
});

async function resolveOrgIdFromFileParam(request: FastifyRequest): Promise<string | undefined> {
  const { fileId } = parseOrThrow(FileIdParamsSchema, request.params);
  return resolveOrgIdFromFile(request.server, fileId);
}

export async function componentRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/files/:fileId/components',
    { preHandler: [app.authenticate, requireOrgRole('VIEWER', resolveOrgIdFromFileParam)] },
    async (request) => {
      const { fileId } = parseOrThrow(FileIdParamsSchema, request.params);
      const components = await app.db.components.listByFile(fileId);
      return { components };
    },
  );

  app.get(
    '/files/:fileId/components/:nodeId/context',
    { preHandler: [app.authenticate, requireOrgRole('VIEWER', resolveOrgIdFromFileParam)] },
    async (request) => {
      const { fileId, nodeId } = parseOrThrow(NodeParamsSchema, request.params);
      const doc = await loadOpenDoc(app.db, fileId);
      const node = doc.getNode(nodeId);
      if (!node) throw new HttpError(404, 'NOT_FOUND', `Node "${nodeId}" does not exist`);

      const designContext = buildDesignContext(doc, [nodeId]);
      const component = await app.db.components.findByNode(fileId, nodeId);
      const attachments = component ? await app.db.components.listAttachments(component.id) : [];
      const generatedCode = component ? await app.db.components.listGeneratedCode(component.id) : [];

      return { designContext, component, attachments, generatedCode };
    },
  );

  app.post(
    '/files/:fileId/components/:nodeId/attachments',
    { preHandler: [app.authenticate, requireOrgRole('EDITOR', resolveOrgIdFromFileParam)] },
    async (request, reply) => {
      const { fileId, nodeId } = parseOrThrow(NodeParamsSchema, request.params);
      const body = parseOrThrow(AttachmentSchema, request.body);

      const doc = await loadOpenDoc(app.db, fileId);
      const node = doc.getNode(nodeId);
      if (!node) throw new HttpError(404, 'NOT_FOUND', `Node "${nodeId}" does not exist`);

      let component = await app.db.components.findByNode(fileId, nodeId);
      if (!component) {
        component = await app.db.components.upsertByNode({
          fileId,
          nodeId,
          name: node.name,
          metadata: {},
        });
      }

      const attachment = await app.db.components.createAttachment({
        componentId: component.id,
        skillId: body.skillId,
        agentId: body.agentId,
        workflowId: body.workflowId,
        prompts: body.prompts as Prisma.InputJsonValue | undefined,
      });

      reply.status(201);
      return { attachment };
    },
  );
}
