import { createHash } from 'node:crypto';
import { z } from 'zod';
import * as Y from 'yjs';
import { OpenDoc } from '@openmake/core';
import type { DocumentData } from '@openmake/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { HttpError, parseOrThrow } from '../plugins/error-handler.js';
import { requireOrgRole, resolveOrgIdFromFile, resolveOrgIdFromProject } from '../plugins/auth.js';
import { loadMergedYDoc } from '../services/doc-service.js';

/** Maximum number of nodes accepted by POST /projects/:projectId/files/import. */
export const MAX_IMPORT_NODES = 50_000;

/**
 * Maximum combined entry count across ALL document collections
 * (nodes + styles + variables + variableCollections + assets) accepted by import.
 * OpenDoc.fromJSON + Y.encodeStateAsUpdate are synchronous and their cost
 * scales with total entries, not just nodes — capping only `nodes` would let
 * a document with a handful of nodes but hundreds of thousands of styles
 * block the event loop for the same cost (see DoS review finding).
 */
export const MAX_IMPORT_ENTRIES = 60_000;

/**
 * Body limit for POST /projects/:projectId/files/import. Synchronous
 * JSON.parse + Y.Doc hydration cost scales roughly linearly with body size
 * (~35 ms/MiB measured), so this is the hard ceiling on per-request event-loop
 * blocking. 10 MiB comfortably fits MAX_IMPORT_NODES minimal nodes (~200 B of
 * JSON each) while keeping worst-case blocking to roughly a third of the
 * previous 25 MiB limit.
 */
export const MAX_IMPORT_BODY_BYTES = 10 * 1024 * 1024;

/**
 * Body limit for PUT /files/:fileId/assets/:hash. Image pixels are streamed
 * straight to object storage (no synchronous hydration), but a hard cap keeps
 * a single upload from buffering an unbounded blob in memory. Mirrors the
 * 10 MiB precedent set by MAX_IMPORT_BODY_BYTES.
 */
export const MAX_ASSET_BODY_BYTES = 10 * 1024 * 1024;

/** Content-types accepted for image asset uploads. */
const ASSET_CONTENT_TYPES = new Set(['image/png', 'image/jpeg']);

/**
 * Per-IP rate limit for the import route. Import is the most expensive
 * synchronous endpoint on the server; the global 200/min limit alone would
 * allow one client to keep the shared event loop saturated cross-tenant.
 */
export const IMPORT_RATE_LIMIT_PER_MINUTE = 10;

const ProjectIdParamsSchema = z.object({ projectId: z.string().min(1) });
const FileIdParamsSchema = z.object({ fileId: z.string().min(1) });
// Assets are content-addressed by a lowercase hex SHA-256 digest.
const AssetParamsSchema = z.object({
  fileId: z.string().min(1),
  hash: z.string().regex(/^[0-9a-f]{64}$/, 'hash must be a lowercase hex SHA-256 digest'),
});
// `?deleted=1` (or `true`) switches the list route into "Trash" mode. Anything
// else lists live files, so an accidental `?deleted=0` behaves like the default.
const ListFilesQuerySchema = z.object({ deleted: z.enum(['1', 'true']).optional() });
const CreateFileSchema = z.object({ name: z.string().min(1) });
const ImportFileSchema = z.object({
  name: z.string().min(1).max(200),
  document: z.unknown(),
});
const UpdateFileSchema = z.object({
  name: z.string().min(1).optional(),
  thumbnailUrl: z.string().nullable().optional(),
});

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Entry count of a record or array; 0 for anything else (schema validation rejects those later). */
function collectionSize(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  if (isPlainObject(value)) return Object.keys(value).length;
  return 0;
}

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
      const { deleted } = parseOrThrow(ListFilesQuerySchema, request.query);
      if (deleted) {
        // Trash listing is an EDITOR+ capability (it exposes recoverable work and
        // pairs with the restore route) even though live listing is VIEWER+.
        // requireOrgRole already confirmed membership and set request.orgId.
        const canEdit = await app.db.orgs.hasAtLeastRole(
          request.orgId!,
          request.user!.id,
          'EDITOR',
        );
        if (!canEdit) {
          throw new HttpError(403, 'FORBIDDEN', 'Insufficient role for this action');
        }
        const files = await app.db.files.listDeletedByProject(projectId);
        return { files };
      }
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

  app.post(
    '/projects/:projectId/files/import',
    {
      preHandler: [app.authenticate, requireOrgRole('EDITOR', resolveOrgIdFromProjectParam)],
      bodyLimit: MAX_IMPORT_BODY_BYTES,
      config: {
        rateLimit: { max: IMPORT_RATE_LIMIT_PER_MINUTE, timeWindow: '1 minute' },
      },
    },
    async (request, reply) => {
      const { projectId } = parseOrThrow(ProjectIdParamsSchema, request.params);
      const body = parseOrThrow(ImportFileSchema, request.body);
      const { document } = body;

      // Cheap structural guards BEFORE hydrating anything into a Y.Doc.
      if (!isPlainObject(document)) {
        throw new HttpError(400, 'INVALID_DOCUMENT', 'Document must be a JSON object');
      }
      const nodeCount = collectionSize(document.nodes);
      if (nodeCount > MAX_IMPORT_NODES) {
        throw new HttpError(
          400,
          'DOCUMENT_TOO_LARGE',
          `Document exceeds the maximum of ${MAX_IMPORT_NODES} nodes`,
        );
      }
      // Hydration cost scales with EVERY collection, not just nodes — bound
      // the combined size so huge styles/variables/assets maps can't sneak
      // past the node-count guard.
      const totalEntries =
        nodeCount +
        collectionSize(document.styles) +
        collectionSize(document.variables) +
        collectionSize(document.variableCollections) +
        collectionSize(document.assets);
      if (totalEntries > MAX_IMPORT_ENTRIES) {
        throw new HttpError(
          400,
          'DOCUMENT_TOO_LARGE',
          `Document exceeds the maximum of ${MAX_IMPORT_ENTRIES} total entries`,
        );
      }

      let doc: OpenDoc;
      try {
        doc = OpenDoc.fromJSON(document as DocumentData);
      } catch (err) {
        // Log only the error identity — the full Zod error embeds
        // attacker-supplied document field paths/values.
        request.log.warn(
          { errName: err instanceof Error ? err.name : typeof err },
          'file import: document failed schema validation',
        );
        throw new HttpError(400, 'INVALID_DOCUMENT', 'Document failed schema validation');
      }

      const state = Y.encodeStateAsUpdate(doc.ydoc);
      const file = await app.db.files.create({ projectId, name: body.name });
      await app.db.docs.saveSnapshot(file.id, 0, state);

      const orgId = await resolveOrgIdFromProject(app, projectId);
      await app.db.audit.append({
        orgId,
        userId: request.user!.id,
        action: 'file.import',
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

  app.post(
    '/files/:fileId/restore',
    { preHandler: [app.authenticate, requireOrgRole('EDITOR', resolveOrgIdFromFileParam)] },
    async (request) => {
      const { fileId } = parseOrThrow(FileIdParamsSchema, request.params);
      const existing = await app.db.files.findById(fileId);
      // A file that never existed, or one that isn't actually trashed, both 404 —
      // restore is only meaningful for a soft-deleted file.
      if (!existing || !existing.deletedAt) throw new HttpError(404, 'NOT_FOUND', 'File not found');
      const file = await app.db.files.restore(fileId);

      const orgId = await resolveOrgIdFromFile(app, fileId);
      await app.db.audit.append({
        orgId,
        userId: request.user!.id,
        action: 'file.restore',
        targetType: 'file',
        targetId: fileId,
      });

      return { file };
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

  // Upload the raw pixels for a content-addressed image asset. EDITOR+.
  // The client hashes the bytes into `:hash`; we re-hash server-side and reject
  // a mismatch so a corrupt or spoofed body can never be stored under a hash it
  // doesn't own. Idempotent: re-uploading an already-stored hash is a 200 no-op.
  app.put(
    '/files/:fileId/assets/:hash',
    {
      preHandler: [app.authenticate, requireOrgRole('EDITOR', resolveOrgIdFromFileParam)],
      bodyLimit: MAX_ASSET_BODY_BYTES,
    },
    async (request, reply) => {
      const { hash } = parseOrThrow(AssetParamsSchema, request.params);

      const contentType = (request.headers['content-type'] ?? '').split(';')[0]!.trim().toLowerCase();
      if (!ASSET_CONTENT_TYPES.has(contentType)) {
        throw new HttpError(400, 'INVALID_CONTENT_TYPE', 'Asset must be image/png or image/jpeg');
      }

      const body = request.body;
      if (!Buffer.isBuffer(body) || body.length === 0) {
        throw new HttpError(400, 'INVALID_BODY', 'Asset body must be non-empty binary data');
      }

      // Integrity: the stored key IS the hash, so a body that doesn't hash to it
      // must never be written — otherwise a GET would serve bytes that lie about
      // their own content address.
      const actualHash = createHash('sha256').update(body).digest('hex');
      if (actualHash !== hash) {
        throw new HttpError(400, 'HASH_MISMATCH', 'Asset content does not match the provided hash');
      }

      // requireOrgRole set request.orgId; tenancy is baked into the object key.
      const key = `${request.orgId!}/${hash}`;
      const already = await app.assetStore.has(key);
      if (!already) {
        await app.assetStore.put(key, body, contentType);
      }
      reply.status(200);
      return { hash, size: body.length, deduplicated: already };
    },
  );

  // Stream an image asset's bytes back. VIEWER+.
  app.get(
    '/files/:fileId/assets/:hash',
    { preHandler: [app.authenticate, requireOrgRole('VIEWER', resolveOrgIdFromFileParam)] },
    async (request, reply) => {
      const { hash } = parseOrThrow(AssetParamsSchema, request.params);
      const key = `${request.orgId!}/${hash}`;
      const asset = await app.assetStore.get(key);
      if (!asset) throw new HttpError(404, 'NOT_FOUND', 'Asset not found');
      reply.type(asset.contentType);
      return asset.bytes;
    },
  );
}
