import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { OrgRole } from '@openmake/database';
import { HttpError } from './error-handler.js';
import { verifyAccessToken } from '../services/auth-service.js';

export interface AuthenticatedUser {
  id: string;
  email: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthenticatedUser;
  }
}

function extractBearerToken(request: FastifyRequest): string | undefined {
  const header = request.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice('Bearer '.length).trim();
  return undefined;
}

/** Fastify preHandler: requires a valid JWT access token, sets request.user. */
export async function authenticate(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const app = request.server;
  const token = extractBearerToken(request);
  if (!token) {
    throw new HttpError(401, 'UNAUTHORIZED', 'Missing bearer token');
  }
  try {
    const payload = verifyAccessToken(app.config, token);
    request.user = { id: payload.sub, email: payload.email };
  } catch {
    throw new HttpError(401, 'UNAUTHORIZED', 'Invalid or expired access token');
  }
}

/** Resolves the orgId that owns a project. Returns undefined if the project doesn't exist. */
export async function resolveOrgIdFromProject(
  app: FastifyInstance,
  projectId: string,
): Promise<string | undefined> {
  const project = await app.db.projects.findById(projectId);
  return project?.orgId;
}

/** Resolves the orgId that (transitively) owns a file. Returns undefined if the file/project don't exist. */
export async function resolveOrgIdFromFile(
  app: FastifyInstance,
  fileId: string,
): Promise<string | undefined> {
  const file = await app.db.files.findById(fileId);
  if (!file) return undefined;
  return resolveOrgIdFromProject(app, file.projectId);
}

export type OrgIdResolver = (request: FastifyRequest) => Promise<string | undefined>;

/**
 * Builds a preHandler that resolves an orgId (via `resolveOrgId`) and requires
 * the authenticated user to be a member with at least `minRole`.
 *
 * - Org doesn't exist, or user isn't a member at all -> 404 (don't confirm existence).
 * - User is a member but below `minRole` -> 403.
 *
 * On success, decorates `request.orgId` with the resolved org id.
 */
export function requireOrgRole(minRole: OrgRole, resolveOrgId: OrgIdResolver) {
  return async function preHandler(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
    const app = request.server;
    if (!request.user) {
      throw new HttpError(401, 'UNAUTHORIZED', 'Missing bearer token');
    }
    const orgId = await resolveOrgId(request);
    if (!orgId) {
      throw new HttpError(404, 'NOT_FOUND', 'Resource not found');
    }
    const org = await app.db.orgs.findById(orgId);
    if (!org) {
      throw new HttpError(404, 'NOT_FOUND', 'Resource not found');
    }
    const member = await app.db.orgs.getMember(orgId, request.user.id);
    if (!member) {
      throw new HttpError(404, 'NOT_FOUND', 'Resource not found');
    }
    const hasRole = await app.db.orgs.hasAtLeastRole(orgId, request.user.id, minRole);
    if (!hasRole) {
      throw new HttpError(403, 'FORBIDDEN', 'Insufficient role for this action');
    }
    request.orgId = orgId;
  };
}

declare module 'fastify' {
  interface FastifyRequest {
    orgId?: string;
  }
}

export interface AuthenticatedApiKey {
  id: string;
  orgId: string;
  scopes: string[];
}

declare module 'fastify' {
  interface FastifyRequest {
    apiKey?: AuthenticatedApiKey;
  }
}

/** Fastify preHandler: requires a valid, active `om_...` API key with the given scope. Sets request.apiKey. */
export function apiKeyAuth(requiredScope: string) {
  return async function preHandler(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
    const app = request.server;
    const token = extractBearerToken(request);
    if (!token || !token.startsWith('om_')) {
      throw new HttpError(401, 'UNAUTHORIZED', 'Missing or malformed API key');
    }
    const { sha256Hex } = await import('../services/auth-service.js');
    const keyHash = sha256Hex(token);
    const key = await app.db.apiKeys.findActiveByHash(keyHash);
    if (!key) {
      throw new HttpError(401, 'UNAUTHORIZED', 'Invalid, revoked, or expired API key');
    }
    void app.db.apiKeys.touchLastUsed(key.id);
    if (!key.scopes.includes(requiredScope)) {
      throw new HttpError(403, 'FORBIDDEN', `API key is missing required scope: ${requiredScope}`);
    }
    request.apiKey = { id: key.id, orgId: key.orgId, scopes: key.scopes };
  };
}

/** Registers the `authenticate` decorator so it can be referenced as `app.authenticate`. */
export function registerAuthPlugin(app: FastifyInstance): void {
  app.decorate('authenticate', authenticate);
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: typeof authenticate;
  }
}
