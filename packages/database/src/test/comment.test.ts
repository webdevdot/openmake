import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestContext, resetDatabase, type TestContext } from './helpers.js';

describe('CommentRepo', () => {
  let ctx: TestContext;
  let fileId: string;
  let authorId: string;

  beforeEach(async () => {
    ctx = await createTestContext();
    await resetDatabase();

    const owner = await ctx.db.users.create({
      email: 'commentowner@example.com',
      passwordHash: 'hashed',
      name: 'Owner',
    });
    authorId = owner.id;
    const org = await ctx.db.orgs.create({
      name: 'CommentOrg',
      slug: 'comment-org',
      ownerId: owner.id,
    });
    const project = await ctx.db.projects.create({ orgId: org.id, name: 'Project' });
    const file = await ctx.db.files.create({ projectId: project.id, name: 'Home.design' });
    fileId = file.id;
  });

  afterAll(async () => {
    await ctx?.teardown();
  });

  it('persists anchorX/anchorY on a free-point comment', async () => {
    const comment = await ctx.db.comments.create({
      fileId,
      authorId,
      body: 'Pinned here',
      anchorX: 42.5,
      anchorY: -17.25,
    });

    expect(comment.anchorX).toBe(42.5);
    expect(comment.anchorY).toBe(-17.25);

    const reread = await ctx.db.comments.findById(comment.id);
    expect(reread?.anchorX).toBe(42.5);
    expect(reread?.anchorY).toBe(-17.25);
  });

  it('leaves anchors null when omitted', async () => {
    const comment = await ctx.db.comments.create({ fileId, authorId, body: 'No anchor' });
    expect(comment.anchorX).toBeNull();
    expect(comment.anchorY).toBeNull();
  });

  it('nests replies under their parent thread and hides them from the top-level list', async () => {
    const parent = await ctx.db.comments.create({
      fileId,
      authorId,
      body: 'Parent',
      anchorX: 1,
      anchorY: 2,
    });
    const reply = await ctx.db.comments.create({
      fileId,
      authorId,
      body: 'Reply',
      parentId: parent.id,
    });

    const threads = await ctx.db.comments.listByFile(fileId);
    expect(threads.map((t) => t.id)).toContain(parent.id);
    expect(threads.map((t) => t.id)).not.toContain(reply.id);
    const parentThread = threads.find((t) => t.id === parent.id);
    expect(parentThread?.replies.map((r) => r.id)).toContain(reply.id);
  });

  it('resolves and unresolves a comment', async () => {
    const comment = await ctx.db.comments.create({
      fileId,
      authorId,
      body: 'Resolve me',
      anchorX: 0,
      anchorY: 0,
    });
    expect(comment.resolvedAt).toBeNull();

    const resolved = await ctx.db.comments.resolve(comment.id);
    expect(resolved.resolvedAt).not.toBeNull();

    const unresolved = await ctx.db.comments.unresolve(comment.id);
    expect(unresolved.resolvedAt).toBeNull();
  });
});
