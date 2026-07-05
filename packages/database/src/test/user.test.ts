import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestContext, resetDatabase, type TestContext } from './helpers.js';

describe('UserRepo', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestContext();
    await resetDatabase();
  });

  afterAll(async () => {
    await ctx?.teardown();
  });

  it('creates and finds a user by id and email', async () => {
    const user = await ctx.db.users.create({
      email: 'ada@example.com',
      passwordHash: 'hashed',
      name: 'Ada Lovelace',
    });

    expect(user.id).toBeTruthy();
    expect(user.role).toBe('USER');

    const byId = await ctx.db.users.findById(user.id);
    expect(byId?.email).toBe('ada@example.com');

    const byEmail = await ctx.db.users.findByEmail('ada@example.com');
    expect(byEmail?.id).toBe(user.id);
  });

  it('enforces unique email', async () => {
    await ctx.db.users.create({
      email: 'dup@example.com',
      passwordHash: 'hashed',
      name: 'First',
    });

    await expect(
      ctx.db.users.create({
        email: 'dup@example.com',
        passwordHash: 'hashed',
        name: 'Second',
      }),
    ).rejects.toThrow();
  });

  it('creates, finds, and revokes a refresh token', async () => {
    const user = await ctx.db.users.create({
      email: 'refresh@example.com',
      passwordHash: 'hashed',
      name: 'Refresh User',
    });

    const created = await ctx.db.users.createRefreshToken({
      userId: user.id,
      tokenHash: 'token-hash-1',
      expiresAt: new Date(Date.now() + 60_000),
    });

    const found = await ctx.db.users.findRefreshTokenByHash('token-hash-1');
    expect(found?.id).toBe(created.id);
    expect(found?.revokedAt).toBeNull();

    await ctx.db.users.revokeRefreshToken(created.id);
    const revoked = await ctx.db.users.findRefreshTokenByHash('token-hash-1');
    expect(revoked?.revokedAt).not.toBeNull();
  });
});
