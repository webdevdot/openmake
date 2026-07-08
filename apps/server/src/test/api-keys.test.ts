import { createHash } from 'node:crypto';
import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import { buildTestApp, type TestApp } from './helpers.js';
import { resetDatabase } from './db-setup.js';

describe('api keys', () => {
  let ctx: TestApp;
  let accessToken: string;
  let orgId: string;

  beforeAll(async () => {
    ctx = await buildTestApp();
  });

  afterAll(async () => {
    await ctx.teardown();
  });

  beforeEach(async () => {
    await resetDatabase();

    const registerRes = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: 'keyholder@example.com',
        password: 'supersecretpassword',
        name: 'Keyholder',
      },
    });
    accessToken = registerRes.json().accessToken;

    const orgsRes = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/orgs',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    orgId = orgsRes.json().orgs[0].id;
  });

  it('creates a key with om_ prefix and a matching stored sha256 hash', async () => {
    const createRes = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/orgs/${orgId}/api-keys`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { name: 'CI key', scopes: ['mcp:read', 'mcp:write'] },
    });
    expect(createRes.statusCode).toBe(201);
    const { apiKey } = createRes.json();
    expect(apiKey.key).toMatch(/^om_/);

    const expectedHash = createHash('sha256').update(apiKey.key).digest('hex');
    const stored = await ctx.db.prisma.apiKey.findUnique({ where: { id: apiKey.id } });
    expect(stored).not.toBeNull();
    expect(stored!.keyHash).toBe(expectedHash);
  });

  it('a revoked key used against /mcp returns 401', async () => {
    const createRes = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/orgs/${orgId}/api-keys`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { name: 'Revoke me', scopes: ['mcp:read'] },
    });
    const { apiKey } = createRes.json();

    const revokeRes = await ctx.app.inject({
      method: 'DELETE',
      url: `/api/v1/orgs/${orgId}/api-keys/${apiKey.id}`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(revokeRes.statusCode).toBe(204);

    const mcpRes = await ctx.app.inject({
      method: 'POST',
      url: '/mcp',
      headers: {
        authorization: `Bearer ${apiKey.key}`,
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      payload: { jsonrpc: '2.0', method: 'tools/list', id: 1 },
    });
    expect(mcpRes.statusCode).toBe(401);
  });
});
