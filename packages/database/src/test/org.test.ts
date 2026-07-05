import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestContext, resetDatabase, type TestContext } from './helpers.js';

describe('OrgRepo', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestContext();
    await resetDatabase();
  });

  afterAll(async () => {
    await ctx?.teardown();
  });

  it('creates an org with an owner membership', async () => {
    const owner = await ctx.db.users.create({
      email: 'owner@example.com',
      passwordHash: 'hashed',
      name: 'Owner',
    });

    const org = await ctx.db.orgs.create({ name: 'Acme', slug: 'acme', ownerId: owner.id });

    const member = await ctx.db.orgs.getMember(org.id, owner.id);
    expect(member?.role).toBe('OWNER');
  });

  it('adds members with roles and checks role hierarchy', async () => {
    const owner = await ctx.db.users.create({
      email: 'owner2@example.com',
      passwordHash: 'hashed',
      name: 'Owner',
    });
    const viewer = await ctx.db.users.create({
      email: 'viewer@example.com',
      passwordHash: 'hashed',
      name: 'Viewer',
    });

    const org = await ctx.db.orgs.create({ name: 'Beta', slug: 'beta', ownerId: owner.id });
    await ctx.db.orgs.addMember(org.id, viewer.id, 'VIEWER');

    expect(await ctx.db.orgs.hasAtLeastRole(org.id, owner.id, 'ADMIN')).toBe(true);
    expect(await ctx.db.orgs.hasAtLeastRole(org.id, viewer.id, 'ADMIN')).toBe(false);
    expect(await ctx.db.orgs.hasAtLeastRole(org.id, viewer.id, 'VIEWER')).toBe(true);

    await ctx.db.orgs.updateMemberRole(org.id, viewer.id, 'EDITOR');
    expect(await ctx.db.orgs.hasAtLeastRole(org.id, viewer.id, 'EDITOR')).toBe(true);

    const members = await ctx.db.orgs.listMembers(org.id);
    expect(members).toHaveLength(2);
  });

  it('enforces unique membership per org/user pair', async () => {
    const owner = await ctx.db.users.create({
      email: 'owner3@example.com',
      passwordHash: 'hashed',
      name: 'Owner',
    });
    const org = await ctx.db.orgs.create({ name: 'Gamma', slug: 'gamma', ownerId: owner.id });

    await expect(ctx.db.orgs.addMember(org.id, owner.id, 'ADMIN')).rejects.toThrow();
  });

  it('enforces unique slug', async () => {
    const owner = await ctx.db.users.create({
      email: 'owner4@example.com',
      passwordHash: 'hashed',
      name: 'Owner',
    });
    await ctx.db.orgs.create({ name: 'Delta', slug: 'delta', ownerId: owner.id });

    await expect(ctx.db.orgs.create({ name: 'Delta 2', slug: 'delta', ownerId: owner.id })).rejects.toThrow();
  });
});
