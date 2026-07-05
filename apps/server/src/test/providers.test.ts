import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import { decryptSecret } from '@openmake/ai';
import { buildTestApp, type TestApp } from './helpers.js';
import { resetDatabase } from './db-setup.js';

describe('providers', () => {
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
      payload: { email: 'admin@example.com', password: 'supersecretpassword', name: 'Admin' },
    });
    accessToken = registerRes.json().accessToken;

    const orgsRes = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/orgs',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    orgId = orgsRes.json().orgs[0].id;
  });

  it('PUT then GET shows hasKey:true and never leaks the raw api key', async () => {
    const rawApiKey = 'sk-super-secret-value-12345';

    const putRes = await ctx.app.inject({
      method: 'PUT',
      url: `/api/v1/orgs/${orgId}/providers/OPENAI`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { apiKey: rawApiKey, baseUrl: 'https://api.openai.com/v1' },
    });
    expect(putRes.statusCode).toBe(200);
    expect(JSON.stringify(putRes.json())).not.toContain(rawApiKey);

    const getRes = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/orgs/${orgId}/providers`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(getRes.statusCode).toBe(200);
    const body = getRes.json();
    expect(JSON.stringify(body)).not.toContain(rawApiKey);
    const provider = body.providers.find((p: { provider: string }) => p.provider === 'OPENAI');
    expect(provider.hasKey).toBe(true);

    const stored = await ctx.db.prisma.aiProvider.findUnique({
      where: { orgId_provider: { orgId, provider: 'OPENAI' } },
    });
    expect(stored).not.toBeNull();
    expect(stored!.encryptedKey).not.toBe(rawApiKey);
    expect(decryptSecret(stored!.encryptedKey, ctx.config.masterEncryptionKey)).toBe(rawApiKey);
  });
});
