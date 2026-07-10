import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestContext, resetDatabase, type TestContext } from './helpers.js';

describe('DocRepo — named versions', () => {
  let ctx: TestContext;
  let fileId: string;
  let authorId: string;

  beforeEach(async () => {
    ctx = await createTestContext();
    await resetDatabase();

    const owner = await ctx.db.users.create({
      email: 'versionowner@example.com',
      passwordHash: 'hashed',
      name: 'Version Owner',
    });
    authorId = owner.id;
    const org = await ctx.db.orgs.create({ name: 'VerOrg', slug: 'ver-org', ownerId: owner.id });
    const project = await ctx.db.projects.create({ orgId: org.id, name: 'Project' });
    const file = await ctx.db.files.create({ projectId: project.id, name: 'Doc.design' });
    fileId = file.id;
  });

  afterAll(async () => {
    await ctx?.teardown();
  });

  it('maxSeq reflects both raw updates and snapshot high-water marks', async () => {
    expect(await ctx.db.docs.maxSeq(fileId)).toBe(0);
    await ctx.db.docs.appendUpdate(fileId, new Uint8Array([1]));
    await ctx.db.docs.appendUpdate(fileId, new Uint8Array([2]));
    expect(await ctx.db.docs.maxSeq(fileId)).toBe(2);

    // A snapshot at a higher seq (e.g. after compaction) advances the high-water mark.
    await ctx.db.docs.saveSnapshot(fileId, 5, new Uint8Array([9]));
    expect(await ctx.db.docs.maxSeq(fileId)).toBe(5);
  });

  it('creates and lists named versions newest-first with author identity', async () => {
    const v1 = await ctx.db.docs.createVersion({ fileId, name: 'First', seq: 1, authorId });
    const v2 = await ctx.db.docs.createVersion({ fileId, name: 'Second', seq: 3, authorId });

    const list = await ctx.db.docs.listVersions(fileId);
    expect(list.map((v) => v.id)).toEqual([v2.id, v1.id]); // newest first
    expect(list[0]!.name).toBe('Second');
    expect(list[0]!.author).toEqual({ id: authorId, name: 'Version Owner' });

    expect((await ctx.db.docs.findVersionById(v1.id))?.seq).toBe(1);
    expect(await ctx.db.docs.findVersionById('nope')).toBeNull();
  });

  it('creating a version + snapshot is non-destructive (no updates deleted)', async () => {
    await ctx.db.docs.appendUpdate(fileId, new Uint8Array([1]));
    await ctx.db.docs.appendUpdate(fileId, new Uint8Array([2]));
    await ctx.db.docs.appendUpdate(fileId, new Uint8Array([3]));

    // Simulate captureVersion's writes: an additive snapshot + the label.
    await ctx.db.docs.saveSnapshot(fileId, 3, new Uint8Array([7, 7]));
    await ctx.db.docs.createVersion({ fileId, name: 'Checkpoint', seq: 3, authorId });

    // Every raw update survives — nothing was compacted away.
    const updates = await ctx.db.docs.listUpdatesSince(fileId, 0);
    expect(updates.map((u) => u.seq)).toEqual([1, 2, 3]);
  });

  it('snapshotAtOrBefore + listUpdatesInRange reconstruct a target seq window', async () => {
    await ctx.db.docs.saveSnapshot(fileId, 0, new Uint8Array([0]));
    await ctx.db.docs.appendUpdate(fileId, new Uint8Array([1]));
    await ctx.db.docs.appendUpdate(fileId, new Uint8Array([2]));
    await ctx.db.docs.saveSnapshot(fileId, 2, new Uint8Array([2, 2]));
    await ctx.db.docs.appendUpdate(fileId, new Uint8Array([3]));

    // Reconstructing state as of seq 3: base is the snapshot at/before 3 (upToSeq=2)...
    const base = await ctx.db.docs.snapshotAtOrBefore(fileId, 3);
    expect(base?.upToSeq).toBe(2);
    // ...plus updates in (2, 3].
    const window = await ctx.db.docs.listUpdatesInRange(fileId, base!.upToSeq, 3);
    expect(window.map((u) => u.seq)).toEqual([3]);

    // Reconstructing as of seq 1 picks the snapshot at 0 + update 1.
    const base1 = await ctx.db.docs.snapshotAtOrBefore(fileId, 1);
    expect(base1?.upToSeq).toBe(0);
    expect((await ctx.db.docs.listUpdatesInRange(fileId, 0, 1)).map((u) => u.seq)).toEqual([1]);
  });
});
