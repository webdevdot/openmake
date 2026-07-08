import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import { buildTestApp, type TestApp } from './helpers.js';
import { resetDatabase } from './db-setup.js';

describe('auth', () => {
  let ctx: TestApp;

  beforeAll(async () => {
    ctx = await buildTestApp();
  });

  afterAll(async () => {
    await ctx.teardown();
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  it('registers, logs in, and reads /auth/me', async () => {
    const registerRes = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'Alice@Example.com', password: 'supersecretpassword', name: 'Alice' },
    });
    expect(registerRes.statusCode).toBe(201);
    const registerBody = registerRes.json();
    expect(registerBody.user.email).toBe('alice@example.com');
    expect(registerBody.accessToken).toBeTruthy();

    const loginRes = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'alice@example.com', password: 'supersecretpassword' },
    });
    expect(loginRes.statusCode).toBe(200);
    const loginBody = loginRes.json();
    expect(loginBody.accessToken).toBeTruthy();

    const meRes = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { authorization: `Bearer ${loginBody.accessToken}` },
    });
    expect(meRes.statusCode).toBe(200);
    expect(meRes.json().user.email).toBe('alice@example.com');
  });

  it('rejects login with wrong password', async () => {
    await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'bob@example.com', password: 'supersecretpassword', name: 'Bob' },
    });

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'bob@example.com', password: 'wrongpassword' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('rejects registration with a weak password', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'weak@example.com', password: 'short', name: 'Weak' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rotates refresh tokens and invalidates the old one', async () => {
    const registerRes = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'carol@example.com', password: 'supersecretpassword', name: 'Carol' },
    });
    const { refreshToken: oldToken } = registerRes.json();

    const refreshRes = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: oldToken },
    });
    expect(refreshRes.statusCode).toBe(200);
    const { refreshToken: newToken } = refreshRes.json();
    expect(newToken).not.toBe(oldToken);

    // Old token must now be rejected (it's revoked).
    const reuseRes = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: oldToken },
    });
    expect(reuseRes.statusCode).toBe(401);
  });

  it("reusing an already-revoked refresh token revokes all of that user's tokens", async () => {
    const registerRes = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'dave@example.com', password: 'supersecretpassword', name: 'Dave' },
    });
    const { refreshToken: firstToken, user } = registerRes.json();

    // Issue a second, still-valid token via login.
    const loginRes = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'dave@example.com', password: 'supersecretpassword' },
    });
    const { refreshToken: secondToken } = loginRes.json();

    // Rotate the first token (revokes it), then try to reuse it — reuse should revoke ALL tokens.
    await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: firstToken },
    });
    const reuseRes = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: firstToken },
    });
    expect(reuseRes.statusCode).toBe(401);

    // The second (previously valid, unrelated) token must now also be revoked.
    const secondRefreshRes = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: secondToken },
    });
    expect(secondRefreshRes.statusCode).toBe(401);

    const tokens = await ctx.db.prisma.refreshToken.findMany({ where: { userId: user.id } });
    expect(tokens.every((t) => t.revokedAt !== null)).toBe(true);
  });

  it('logout revokes the given refresh token', async () => {
    const registerRes = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'erin@example.com', password: 'supersecretpassword', name: 'Erin' },
    });
    const { refreshToken } = registerRes.json();

    const logoutRes = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      payload: { refreshToken },
    });
    expect(logoutRes.statusCode).toBe(200);

    const refreshRes = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken },
    });
    expect(refreshRes.statusCode).toBe(401);
  });

  it('rate limits rapid logins to 5/min, 6th attempt is 429', async () => {
    await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'frank@example.com', password: 'supersecretpassword', name: 'Frank' },
    });

    let lastStatus = 0;
    for (let i = 0; i < 6; i++) {
      const res = await ctx.app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: 'frank@example.com', password: 'wrongpassword' },
      });
      lastStatus = res.statusCode;
    }
    expect(lastStatus).toBe(429);
  });
});
