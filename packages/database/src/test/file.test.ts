import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestContext, resetDatabase, type TestContext } from './helpers.js';

describe('FileRepo', () => {
  let ctx: TestContext;
  let projectId: string;

  beforeEach(async () => {
    ctx = await createTestContext();
    await resetDatabase();

    const owner = await ctx.db.users.create({
      email: 'fileowner@example.com',
      passwordHash: 'hashed',
      name: 'Owner',
    });
    const org = await ctx.db.orgs.create({ name: 'FileOrg', slug: 'file-org', ownerId: owner.id });
    const project = await ctx.db.projects.create({ orgId: org.id, name: 'Project' });
    projectId = project.id;
  });

  afterAll(async () => {
    await ctx?.teardown();
  });

  it('soft deletes a file and excludes it from listByProject', async () => {
    const file = await ctx.db.files.create({ projectId, name: 'Home.design' });

    let files = await ctx.db.files.listByProject(projectId);
    expect(files.map((f) => f.id)).toContain(file.id);

    await ctx.db.files.softDelete(file.id);

    files = await ctx.db.files.listByProject(projectId);
    expect(files.map((f) => f.id)).not.toContain(file.id);

    const stillExists = await ctx.db.files.findById(file.id);
    expect(stillExists?.deletedAt).not.toBeNull();
  });

  it('restores a soft-deleted file', async () => {
    const file = await ctx.db.files.create({ projectId, name: 'Restorable.design' });
    await ctx.db.files.softDelete(file.id);
    await ctx.db.files.restore(file.id);

    const files = await ctx.db.files.listByProject(projectId);
    expect(files.map((f) => f.id)).toContain(file.id);
  });

  it('listDeletedByProject returns only soft-deleted files', async () => {
    const kept = await ctx.db.files.create({ projectId, name: 'Kept.design' });
    const trashed = await ctx.db.files.create({ projectId, name: 'Trashed.design' });
    await ctx.db.files.softDelete(trashed.id);

    const deleted = await ctx.db.files.listDeletedByProject(projectId);
    const ids = deleted.map((f) => f.id);
    expect(ids).toContain(trashed.id);
    expect(ids).not.toContain(kept.id);
  });
});
