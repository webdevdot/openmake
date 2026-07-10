import { z } from 'zod';
import { OpenDoc, replaceDocContent } from '@openmake/core';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { HttpError, parseOrThrow } from '../plugins/error-handler.js';
import { requireOrgRole, resolveOrgIdFromFile } from '../plugins/auth.js';
import {
  captureVersion,
  loadMergedYDocAtSeq,
  VersionUnavailableError,
} from '../services/doc-service.js';

const FileIdParamsSchema = z.object({ fileId: z.string().min(1) });
const VersionParamsSchema = z.object({
  fileId: z.string().min(1),
  versionId: z.string().min(1),
});
const CreateVersionSchema = z.object({ name: z.string().trim().min(1).max(200) });

async function resolveOrgIdFromFileParam(request: FastifyRequest): Promise<string | undefined> {
  const { fileId } = parseOrThrow(FileIdParamsSchema, request.params);
  return resolveOrgIdFromFile(request.server, fileId);
}

/**
 * Named version history for a file's CRDT document.
 *
 * - Versions are non-destructive labels pointing at a log seq; creating one also
 *   writes a correctly-labelled snapshot so the checkpoint stays reconstructable.
 * - Restore is ALSO non-destructive: it reconstructs the target state and applies
 *   it to the live doc as a single NEW appended update (broadcast to peers), so it
 *   never deletes updates/snapshots nor resets the log.
 */
export async function versionRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/files/:fileId/versions',
    { preHandler: [app.authenticate, requireOrgRole('EDITOR', resolveOrgIdFromFileParam)] },
    async (request, reply) => {
      const { fileId } = parseOrThrow(FileIdParamsSchema, request.params);
      const { name } = parseOrThrow(CreateVersionSchema, request.body);

      const file = await app.db.files.findById(fileId);
      if (!file || file.deletedAt) throw new HttpError(404, 'NOT_FOUND', 'File not found');

      const version = await captureVersion(app.db, fileId, name, request.user!.id);

      const orgId = await resolveOrgIdFromFile(app, fileId);
      await app.db.audit.append({
        orgId,
        userId: request.user!.id,
        action: 'file.version.create',
        targetType: 'file',
        targetId: fileId,
        detail: { versionId: version.id, seq: version.seq },
      });

      reply.status(201);
      return { version };
    },
  );

  app.get(
    '/files/:fileId/versions',
    { preHandler: [app.authenticate, requireOrgRole('VIEWER', resolveOrgIdFromFileParam)] },
    async (request) => {
      const { fileId } = parseOrThrow(FileIdParamsSchema, request.params);
      const file = await app.db.files.findById(fileId);
      if (!file || file.deletedAt) throw new HttpError(404, 'NOT_FOUND', 'File not found');

      const [rows, snapshots] = await Promise.all([
        app.db.docs.listVersions(fileId),
        app.db.docs.listSnapshots(fileId),
      ]);

      const versions = rows.map((v) => ({
        id: v.id,
        name: v.name,
        seq: v.seq,
        createdAt: v.createdAt,
        author: v.author,
      }));
      const autoCheckpoints = snapshots.map((s) => ({
        id: s.id,
        upToSeq: s.upToSeq,
        createdAt: s.createdAt,
      }));

      return { versions, autoCheckpoints };
    },
  );

  app.post(
    '/files/:fileId/versions/:versionId/restore',
    { preHandler: [app.authenticate, requireOrgRole('EDITOR', resolveOrgIdFromFileParam)] },
    async (request) => {
      const { fileId, versionId } = parseOrThrow(VersionParamsSchema, request.params);
      const file = await app.db.files.findById(fileId);
      if (!file || file.deletedAt) throw new HttpError(404, 'NOT_FOUND', 'File not found');

      const version = await app.db.docs.findVersionById(versionId);
      // A version id that doesn't exist, or belongs to a different file, both 404 —
      // don't leak the existence of other files' versions.
      if (!version || version.fileId !== fileId) {
        throw new HttpError(404, 'NOT_FOUND', 'Version not found');
      }

      let targetData;
      try {
        const targetYdoc = await loadMergedYDocAtSeq(app.db, fileId, version.seq);
        targetData = OpenDoc.fromYDoc(targetYdoc).toJSON();
      } catch (err) {
        if (err instanceof VersionUnavailableError) {
          throw new HttpError(409, 'VERSION_UNAVAILABLE', err.message);
        }
        throw err;
      }

      // Non-destructive restore: rewrite the LIVE doc's contents to match the
      // target as a single new appended update, broadcast to connected editors.
      // History (DocUpdate/DocSnapshot rows) is never deleted or reset.
      await app.docSyncHub.applyContentUpdate(fileId, (ydoc) => {
        replaceDocContent(ydoc, targetData);
      });

      const orgId = await resolveOrgIdFromFile(app, fileId);
      await app.db.audit.append({
        orgId,
        userId: request.user!.id,
        action: 'file.version.restore',
        targetType: 'file',
        targetId: fileId,
        detail: { versionId: version.id, seq: version.seq },
      });

      return {
        version: {
          id: version.id,
          name: version.name,
          seq: version.seq,
          createdAt: version.createdAt,
        },
      };
    },
  );
}
