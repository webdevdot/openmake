import { z } from 'zod';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { HttpError, parseOrThrow } from '../plugins/error-handler.js';
import { requireOrgRole, resolveOrgIdFromFile } from '../plugins/auth.js';

const FileIdParamsSchema = z.object({ fileId: z.string().min(1) });
const CommentParamsSchema = z.object({ fileId: z.string().min(1), commentId: z.string().min(1) });

const CreateCommentSchema = z.object({
  nodeId: z.string().optional(),
  body: z.string().min(1),
  parentId: z.string().optional(),
});

const UpdateCommentSchema = z.object({ resolved: z.boolean() });

async function resolveOrgIdFromFileParam(request: FastifyRequest): Promise<string | undefined> {
  const { fileId } = parseOrThrow(FileIdParamsSchema, request.params);
  return resolveOrgIdFromFile(request.server, fileId);
}

export async function commentRoutes(app: FastifyInstance): Promise<void> {
  /** Returns the comment only if it belongs to the file in the URL (IDOR guard). */
  const loadOwnedComment = async (commentId: string, fileId: string) => {
    const comment = await app.db.comments.findById(commentId);
    if (!comment || comment.fileId !== fileId) {
      throw new HttpError(404, 'NOT_FOUND', 'Comment not found');
    }
    return comment;
  };

  app.get(
    '/files/:fileId/comments',
    { preHandler: [app.authenticate, requireOrgRole('VIEWER', resolveOrgIdFromFileParam)] },
    async (request) => {
      const { fileId } = parseOrThrow(FileIdParamsSchema, request.params);
      const comments = await app.db.comments.listByFile(fileId);
      return { comments };
    },
  );

  app.post(
    '/files/:fileId/comments',
    { preHandler: [app.authenticate, requireOrgRole('VIEWER', resolveOrgIdFromFileParam)] },
    async (request, reply) => {
      const { fileId } = parseOrThrow(FileIdParamsSchema, request.params);
      const body = parseOrThrow(CreateCommentSchema, request.body);
      const comment = await app.db.comments.create({
        fileId,
        nodeId: body.nodeId,
        authorId: request.user!.id,
        body: body.body,
        parentId: body.parentId,
      });
      reply.status(201);
      return { comment };
    },
  );

  app.patch(
    '/files/:fileId/comments/:commentId',
    { preHandler: [app.authenticate, requireOrgRole('VIEWER', resolveOrgIdFromFileParam)] },
    async (request) => {
      const { fileId, commentId } = parseOrThrow(CommentParamsSchema, request.params);
      await loadOwnedComment(commentId, fileId);
      const body = parseOrThrow(UpdateCommentSchema, request.body);
      const comment = body.resolved
        ? await app.db.comments.resolve(commentId)
        : await app.db.comments.unresolve(commentId);
      return { comment };
    },
  );

  app.delete(
    '/files/:fileId/comments/:commentId',
    { preHandler: [app.authenticate, requireOrgRole('VIEWER', resolveOrgIdFromFileParam)] },
    async (request, reply) => {
      const { fileId, commentId } = parseOrThrow(CommentParamsSchema, request.params);
      const comment = await loadOwnedComment(commentId, fileId);

      const isAuthor = comment.authorId === request.user!.id;
      if (!isAuthor) {
        const hasAdmin = await app.db.orgs.hasAtLeastRole(request.orgId!, request.user!.id, 'ADMIN');
        if (!hasAdmin) {
          throw new HttpError(403, 'FORBIDDEN', 'Only the author or an admin can delete this comment');
        }
      }

      await app.db.comments.delete(commentId);
      reply.status(204);
    },
  );
}
