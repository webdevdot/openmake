import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestContext, resetDatabase, type TestContext } from './helpers.js';

describe('ApiKeyRepo', () => {
  let ctx: TestContext;
  let orgId: string;

  beforeEach(async () => {
    ctx = await createTestContext();
    await resetDatabase();

    const owner = await ctx.db.users.create({
      email: 'apikeyowner@example.com',
      passwordHash: 'hashed',
      name: 'Owner',
    });
    const org = await ctx.db.orgs.create({ name: 'KeyOrg', slug: 'key-org', ownerId: owner.id });
    orgId = org.id;
  });

  afterAll(async () => {
    await ctx?.teardown();
  });

  it('finds an active key by hash', async () => {
    const key = await ctx.db.apiKeys.create({
      orgId,
      name: 'CI key',
      keyHash: 'hash-active',
      scopes: ['mcp:read'],
    });

    const found = await ctx.db.apiKeys.findActiveByHash('hash-active');
    expect(found?.id).toBe(key.id);
  });

  it('excludes a revoked key', async () => {
    await ctx.db.apiKeys.create({
      orgId,
      name: 'Revoked key',
      keyHash: 'hash-revoked',
      scopes: ['mcp:read'],
    });
    const key = await ctx.db.apiKeys.findActiveByHash('hash-revoked');
    await ctx.db.apiKeys.revoke(key!.id);

    const found = await ctx.db.apiKeys.findActiveByHash('hash-revoked');
    expect(found).toBeNull();
  });

  it('excludes an expired key', async () => {
    await ctx.db.apiKeys.create({
      orgId,
      name: 'Expired key',
      keyHash: 'hash-expired',
      scopes: ['mcp:read'],
      expiresAt: new Date(Date.now() - 1000),
    });

    const found = await ctx.db.apiKeys.findActiveByHash('hash-expired');
    expect(found).toBeNull();
  });

  it('includes a key with a future expiry', async () => {
    await ctx.db.apiKeys.create({
      orgId,
      name: 'Future key',
      keyHash: 'hash-future',
      scopes: ['mcp:write'],
      expiresAt: new Date(Date.now() + 60_000),
    });

    const found = await ctx.db.apiKeys.findActiveByHash('hash-future');
    expect(found).not.toBeNull();
  });

  it('enforces unique keyHash', async () => {
    await ctx.db.apiKeys.create({ orgId, name: 'A', keyHash: 'dup-hash', scopes: [] });
    await expect(
      ctx.db.apiKeys.create({ orgId, name: 'B', keyHash: 'dup-hash', scopes: [] }),
    ).rejects.toThrow();
  });
});
