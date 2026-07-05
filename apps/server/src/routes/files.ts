import { z } from 'zod';
import * as Y from 'yjs';
import { OpenDoc } from '@openmake/core';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { HttpError, parseOrThrow } from '../plugins/error-handler.js';
import { requireOrgRole, resolveOrgIdFromFile, resolveOrgIdFromProject } from '../plugins/auth.js';
import { loadMergedYDoc } from '../services/doc-service.js';

const ProjectIdParamsSchema = z.object({ projectId: z.string().min(1) });
const FileIdParamsSchema = z.object({ fileId: z.string().min(1) });
const CreateFileSchema = z.object({ name: z.string().min(1) });
const UpdateFileSchema = z.object({
  name: z.string().min(1).optional(),
  thumbnailUrl: z.string().nullable().optional(),
});

async function resolveOrgIdFromProjectParam(request: FastifyRequest): Promise<string | undefined> {
  const { projectId } = parseOrThrow(ProjectIdParamsSchema, request.params);
  return resolveOrgIdFromProject(request.server, projectId);
}

async function resolveOrgIdFromFileParam(request: FastifyRequest): Promise<string | undefined> {
  const { fileId } = parseOrThrow(FileIdParamsSchema, request.params);
  return resolveOrgIdFromFile(request.server, fileId);
}

export async function fileRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/projects/:projectId/files',
    { preHandler: [app.authenticate, requireOrgRole('VIEWER', resolveOrgIdFromProjectParam)] },
    async (request) => {
      const { projectId } = parseOrThrow(ProjectIdParamsSchema, request.params);
      const files = await app.db.files.listByProject(projectId);
      return { files };
    },
  );

  app.post(
    '/projects/:projectId/files',
    { preHandler: [app.authenticate, requireOrgRole('EDITOR', resolveOrgIdFromProjectParam)] },
    async (request, reply) => {
      const { projectId } = parseOrThrow(ProjectIdParamsSchema, request.params);
      const body = parseOrThrow(CreateFileSchema, request.body);

      const doc = OpenDoc.create({ name: body.name });
      const state = Y.encodeStateAsUpdate(doc.ydoc);
      const file = await app.db.files.create({ projectId, name: body.name });
      await app.db.docs.saveSnapshot(file.id, 0, state);

      const orgId = await resolveOrgIdFromProject(app, projectId);
      await app.db.audit.append({
        orgId,
        userId: request.user!.id,
        action: 'file.create',
        targetType: 'file',
        targetId: file.id,
      });

      reply.status(201);
      return { file };
    },
  );

  app.get(
    '/files/:fileId',
    { preHandler: [app.authenticate, requireOrgRole('VIEWER', resolveOrgIdFromFileParam)] },
    async (request) => {
      const { fileId } = parseOrThrow(FileIdParamsSchema, request.params);
      const file = await app.db.files.findById(fileId);
      if (!file || file.deletedAt) throw new HttpError(404, 'NOT_FOUND', 'File not found');
      return { file };
    },
  );

  app.patch(
    '/files/:fileId',
    { preHandler: [app.authenticate, requireOrgRole('EDITOR', resolveOrgIdFromFileParam)] },
    async (request) => {
      const { fileId } = parseOrThrow(FileIdParamsSchema, request.params);
      const existing = await app.db.files.findById(fileId);
      if (!existing || existing.deletedAt) throw new HttpError(404, 'NOT_FOUND', 'File not found');
      const body = parseOrThrow(UpdateFileSchema, request.body);
      const file = await app.db.files.update(fileId, body);
      return { file };
    },
  );

  app.delete(
    '/files/:fileId',
    { preHandler: [app.authenticate, requireOrgRole('EDITOR', resolveOrgIdFromFileParam)] },
    async (request, reply) => {
      const { fileId } = parseOrThrow(FileIdParamsSchema, request.params);
      const existing = await app.db.files.findById(fileId);
      if (!existing || existing.deletedAt) throw new HttpError(404, 'NOT_FOUND', 'File not found');
      await app.db.files.softDelete(fileId);

      const orgId = await resolveOrgIdFromFile(app, fileId);
      await app.db.audit.append({
        orgId,
        userId: request.user!.id,
        action: 'file.delete',
        targetType: 'file',
        targetId: fileId,
      });

      reply.status(204);
    },
  );

  app.get(
    '/files/:fileId/snapshot',
    { preHandler: [app.authenticate, requireOrgRole('VIEWER', resolveOrgIdFromFileParam)] },
    async (request, reply) => {
      const { fileId } = parseOrThrow(FileIdParamsSchema, request.params);
      const file = await app.db.files.findById(fileId);
      if (!file || file.deletedAt) throw new HttpError(404, 'NOT_FOUND', 'File not found');

      const ydoc = await loadMergedYDoc(app.db, fileId);
      const mergedState = Y.encodeStateAsUpdate(ydoc);
      reply.type('application/octet-stream');
      return Buffer.from(mergedState);
    },
  );
}
