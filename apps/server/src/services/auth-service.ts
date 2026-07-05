import { createHash, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { Database } from '@openmake/database';
import type { Config } from '../config.js';

export interface AccessTokenPayload {
  sub: string;
  email: string;
}

const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const ISSUER = 'openmake';

/** Signs a short-lived access token for a user. */
export function signAccessToken(config: Config, payload: AccessTokenPayload): string {
  return jwt.sign(payload, config.jwtSecret, {
    expiresIn: ACCESS_TOKEN_EXPIRY,
    issuer: ISSUER,
    algorithm: 'HS256',
  });
}

/** Verifies an access token, throwing if invalid/expired/wrong issuer. */
export function verifyAccessToken(config: Config, token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, config.jwtSecret, {
    issuer: ISSUER,
    algorithms: ['HS256'],
  });
  return decoded as AccessTokenPayload;
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export interface IssuedRefreshToken {
  raw: string;
  expiresAt: Date;
}

/** Generates a new raw refresh token and persists its hash for a user. */
export async function issueRefreshToken(db: Database, userId: string): Promise<IssuedRefreshToken> {
  const raw = randomBytes(32).toString('base64url');
  const tokenHash = sha256Hex(raw);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);
  await db.users.createRefreshToken({ userId, tokenHash, expiresAt });
  return { raw, expiresAt };
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
}

/** Issues a fresh access+refresh token pair for a user. */
export async function issueTokenPair(
  config: Config,
  db: Database,
  user: { id: string; email: string },
): Promise<TokenPair> {
  const accessToken = signAccessToken(config, { sub: user.id, email: user.email });
  const refresh = await issueRefreshToken(db, user.id);
  return { accessToken, refreshToken: refresh.raw, refreshExpiresAt: refresh.expiresAt };
}

export function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}
