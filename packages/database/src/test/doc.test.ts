import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestContext, resetDatabase, type TestContext } from './helpers.js';

describe('DocRepo', () => {
  let ctx: TestContext;
  let fileId: string;

  beforeEach(async () => {
    ctx = await createTestContext();
    await resetDatabase();

    const owner = await ctx.db.users.create({
      email: 'docowner@example.com',
      passwordHash: 'hashed',
      name: 'Owner',
    });
    const org = await ctx.db.orgs.create({ name: 'DocOrg', slug: 'doc-org', ownerId: owner.id });
    const project = await ctx.db.projects.create({ orgId: org.id, name: 'Project' });
    const file = await ctx.db.files.create({ projectId: project.id, name: 'Doc.design' });
    fileId = file.id;
  });

  afterAll(async () => {
    await ctx?.teardown();
  });

  it('assigns sequential seq numbers on append and lists them in order', async () => {
    const u1 = await ctx.db.docs.appendUpdate(fileId, new Uint8Array([1]));
    const u2 = await ctx.db.docs.appendUpdate(fileId, new Uint8Array([2]));
    const u3 = await ctx.db.docs.appendUpdate(fileId, new Uint8Array([3]));

    expect([u1.seq, u2.seq, u3.seq]).toEqual([1, 2, 3]);

    const all = await ctx.db.docs.listUpdatesSince(fileId, 0);
    expect(all.map((u) => u.seq)).toEqual([1, 2, 3]);

    const sinceOne = await ctx.db.docs.listUpdatesSince(fileId, 1);
    expect(sinceOne.map((u) => u.seq)).toEqual([2, 3]);
  });

  it('gives concurrent appendUpdate calls distinct sequential seqs', async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) => ctx.db.docs.appendUpdate(fileId, new Uint8Array([i]))),
    );

    const seqs = results.map((r) => r.seq).sort((a, b) => a - b);
    expect(seqs).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(new Set(seqs).size).toBe(10);
  });

  it('saves and retrieves the latest snapshot', async () => {
    await ctx.db.docs.appendUpdate(fileId, new Uint8Array([1]));
    await ctx.db.docs.appendUpdate(fileId, new Uint8Array([2]));

    await ctx.db.docs.saveSnapshot(fileId, 1, new Uint8Array([9, 9]));
    const snap2 = await ctx.db.docs.saveSnapshot(fileId, 2, new Uint8Array([8, 8]));

    const latest = await ctx.db.docs.latestSnapshot(fileId);
    expect(latest?.id).toBe(snap2.id);
    expect(latest?.upToSeq).toBe(2);
  });

  it('compacts by writing a snapshot and deleting covered updates atomically', async () => {
    await ctx.db.docs.appendUpdate(fileId, new Uint8Array([1]));
    await ctx.db.docs.appendUpdate(fileId, new Uint8Array([2]));
    await ctx.db.docs.appendUpdate(fileId, new Uint8Array([3]));

    await ctx.db.docs.compact(fileId, 2, new Uint8Array([7, 7]));

    const remaining = await ctx.db.docs.listUpdatesSince(fileId, 0);
    expect(remaining.map((u) => u.seq)).toEqual([3]);

    const snapshot = await ctx.db.docs.latestSnapshot(fileId);
    expect(snapshot?.upToSeq).toBe(2);
  });
});
