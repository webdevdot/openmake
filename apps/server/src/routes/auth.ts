import argon2 from 'argon2';
import { z } from 'zod';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { HttpError, parseOrThrow } from '../plugins/error-handler.js';
import { issueTokenPair, normalizeEmail, sha256Hex } from '../services/auth-service.js';

const REFRESH_COOKIE_NAME = 'om_refresh';
const REFRESH_COOKIE_PATH = '/api/v1/auth';

const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(10, 'Password must be at least 10 characters'),
  name: z.string().min(1),
});

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const RefreshSchema = z.object({
  refreshToken: z.string().optional(),
});

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 40);
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 8);
}

function setRefreshCookie(
  reply: FastifyReply,
  app: FastifyInstance,
  token: string,
  expiresAt: Date,
): void {
  reply.setCookie(REFRESH_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: app.config.isProd,
    path: REFRESH_COOKIE_PATH,
    expires: expiresAt,
  });
}

function clearRefreshCookie(reply: FastifyReply, app: FastifyInstance): void {
  reply.clearCookie(REFRESH_COOKIE_NAME, { path: REFRESH_COOKIE_PATH, secure: app.config.isProd });
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/auth/register',
    { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const body = parseOrThrow(RegisterSchema, request.body);
      const email = normalizeEmail(body.email);

      const existing = await app.db.users.findByEmail(email);
      if (existing) {
        throw new HttpError(409, 'CONFLICT', 'An account with this email already exists');
      }

      const passwordHash = await argon2.hash(body.password, { type: argon2.argon2id });
      const user = await app.db.users.create({ email, passwordHash, name: body.name });

      const org = await app.db.orgs.create({
        name: `${body.name}'s Org`,
        slug: `${slugify(body.name) || 'org'}-${randomSuffix()}`,
        ownerId: user.id,
      });
      await app.db.projects.create({ orgId: org.id, name: 'My Project' });

      const tokens = await issueTokenPair(app.config, app.db, user);
      setRefreshCookie(reply, app, tokens.refreshToken, tokens.refreshExpiresAt);

      await app.db.audit.append({
        orgId: org.id,
        userId: user.id,
        action: 'auth.register',
        targetType: 'user',
        targetId: user.id,
      });

      reply.status(201);
      return {
        user: { id: user.id, email: user.email, name: user.name },
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      };
    },
  );

  app.post(
    '/auth/login',
    { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const body = parseOrThrow(LoginSchema, request.body);
      const email = normalizeEmail(body.email);

      const user = await app.db.users.findByEmail(email);
      if (!user) {
        throw new HttpError(401, 'UNAUTHORIZED', 'Invalid credentials');
      }
      const valid = await argon2.verify(user.passwordHash, body.password);
      if (!valid) {
        throw new HttpError(401, 'UNAUTHORIZED', 'Invalid credentials');
      }

      const tokens = await issueTokenPair(app.config, app.db, user);
      setRefreshCookie(reply, app, tokens.refreshToken, tokens.refreshExpiresAt);

      await app.db.audit.append({
        userId: user.id,
        action: 'auth.login',
        targetType: 'user',
        targetId: user.id,
      });

      return {
        user: { id: user.id, email: user.email, name: user.name },
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      };
    },
  );

  app.post('/auth/refresh', async (request, reply) => {
    const body = parseOrThrow(RefreshSchema, request.body ?? {});
    const cookies = request.cookies as Record<string, string | undefined>;
    // Cookie takes precedence over body if both are present.
    const rawToken = cookies[REFRESH_COOKIE_NAME] ?? body.refreshToken;

    if (!rawToken) {
      throw new HttpError(401, 'UNAUTHORIZED', 'No refresh token provided');
    }

    const tokenHash = sha256Hex(rawToken);
    const existing = await app.db.users.findRefreshTokenByHash(tokenHash);
    if (!existing) {
      throw new HttpError(401, 'UNAUTHORIZED', 'Invalid refresh token');
    }

    if (existing.revokedAt) {
      // Reuse of an already-revoked token: possible theft — revoke ALL of this user's tokens.
      await app.db.prisma.refreshToken.updateMany({
        where: { userId: existing.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await app.db.audit.append({
        userId: existing.userId,
        action: 'auth.refresh_token_reuse_detected',
        targetType: 'refresh_token',
        targetId: existing.id,
      });
      clearRefreshCookie(reply, app);
      throw new HttpError(401, 'UNAUTHORIZED', 'Refresh token has already been used');
    }

    if (existing.expiresAt.getTime() < Date.now()) {
      throw new HttpError(401, 'UNAUTHORIZED', 'Refresh token has expired');
    }

    const user = await app.db.users.findById(existing.userId);
    if (!user) {
      throw new HttpError(401, 'UNAUTHORIZED', 'Invalid refresh token');
    }

    await app.db.users.revokeRefreshToken(existing.id);
    const tokens = await issueTokenPair(app.config, app.db, user);
    setRefreshCookie(reply, app, tokens.refreshToken, tokens.refreshExpiresAt);

    return { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken };
  });

  app.post('/auth/logout', async (request, reply) => {
    const body = parseOrThrow(RefreshSchema, request.body ?? {});
    const cookies = request.cookies as Record<string, string | undefined>;
    const rawToken = cookies[REFRESH_COOKIE_NAME] ?? body.refreshToken;

    if (rawToken) {
      const tokenHash = sha256Hex(rawToken);
      const existing = await app.db.users.findRefreshTokenByHash(tokenHash);
      if (existing && !existing.revokedAt) {
        await app.db.users.revokeRefreshToken(existing.id);
        await app.db.audit.append({
          userId: existing.userId,
          action: 'auth.logout',
          targetType: 'refresh_token',
          targetId: existing.id,
        });
      }
    }

    clearRefreshCookie(reply, app);
    return { ok: true };
  });

  app.get('/auth/me', { preHandler: app.authenticate }, async (request) => {
    const user = await app.db.users.findById(request.user!.id);
    if (!user) {
      throw new HttpError(404, 'NOT_FOUND', 'User not found');
    }
    return { user: { id: user.id, email: user.email, name: user.name, avatarUrl: user.avatarUrl } };
  });
}
