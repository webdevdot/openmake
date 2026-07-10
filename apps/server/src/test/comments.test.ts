import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { buildTestApp, type TestApp } from './helpers.js';
import { resetDatabase } from './db-setup.js';

describe('comments', () => {
  let ctx: TestApp;
  let ownerToken: string; // file author + org owner (EDITOR+)
  let viewerToken: string; // VIEWER-role member
  let outsiderToken: string; // non-member
  let orgId: string;
  let projectId: string;
  let fileId: string;

  // Register/login is rate-limited to 5/min per app instance and the limiter is
  // not reset between tests, so every fixture user is registered exactly once
  // here (3 registers) and the DB is reset only once.
  beforeAll(async () => {
    ctx = await buildTestApp();
    await resetDatabase();

    const ownerRes = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'commenter@example.com', password: 'supersecretpassword', name: 'Owner' },
    });
    ownerToken = ownerRes.json().accessToken;

    const outsiderRes = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'outsider-c@example.com', password: 'supersecretpassword', name: 'Out' },
    });
    outsiderToken = outsiderRes.json().accessToken;

    const orgsRes = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/orgs',
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    orgId = orgsRes.json().orgs[0].id;

    const projectsRes = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/orgs/${orgId}/projects`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    projectId = projectsRes.json().projects[0].id;

    const fileRes = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/files`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { name: 'Commented File' },
    });
    fileId = fileRes.json().file.id;

    // A VIEWER-role member of the owner's org.
    const viewerRes = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'viewer-c@example.com', password: 'supersecretpassword', name: 'Viewer' },
    });
    viewerToken = viewerRes.json().accessToken;
    await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/orgs/${orgId}/members`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { email: 'viewer-c@example.com', role: 'VIEWER' },
    });
  });

  afterAll(async () => {
    await ctx.teardown();
  });

  it('creates a free-point comment with anchorX/anchorY and lists it back', async () => {
    const createRes = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/files/${fileId}/comments`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { body: 'Pinned to a canvas point', anchorX: 120.5, anchorY: -40.25 },
    });
    expect(createRes.statusCode).toBe(201);
    const created = createRes.json().comment;
    expect(created.anchorX).toBe(120.5);
    expect(created.anchorY).toBe(-40.25);
    expect(created.nodeId).toBeNull();
    expect(created.parentId).toBeNull();

    const listRes = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/files/${fileId}/comments`,
      headers: { authorization: `Bearer ${viewerToken}` },
    });
    expect(listRes.statusCode).toBe(200);
    const found = listRes.json().comments.find((c: { id: string }) => c.id === created.id);
    expect(found).toBeDefined();
    expect(found.anchorX).toBe(120.5);
    expect(found.anchorY).toBe(-40.25);
    expect(Array.isArray(found.replies)).toBe(true);
  });

  it('omitting anchors leaves them null (e.g. a node-pinned or general comment)', async () => {
    const createRes = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/files/${fileId}/comments`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { body: 'No anchor' },
    });
    expect(createRes.statusCode).toBe(201);
    const created = createRes.json().comment;
    expect(created.anchorX).toBeNull();
    expect(created.anchorY).toBeNull();
  });

  it('threads a reply under a parent and nests it in the list', async () => {
    const parentRes = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/files/${fileId}/comments`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { body: 'Parent thread', anchorX: 10, anchorY: 20 },
    });
    const parentId = parentRes.json().comment.id;

    const replyRes = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/files/${fileId}/comments`,
      headers: { authorization: `Bearer ${viewerToken}` },
      payload: { body: 'A reply', parentId },
    });
    expect(replyRes.statusCode).toBe(201);
    expect(replyRes.json().comment.parentId).toBe(parentId);

    const listRes = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/files/${fileId}/comments`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    const parent = listRes.json().comments.find((c: { id: string }) => c.id === parentId);
    // Replies are not surfaced as top-level threads.
    expect(listRes.json().comments.map((c: { id: string }) => c.id)).not.toContain(
      replyRes.json().comment.id,
    );
    expect(parent.replies.map((r: { body: string }) => r.body)).toContain('A reply');
  });

  it('resolves and unresolves a comment via PATCH', async () => {
    const createRes = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/files/${fileId}/comments`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { body: 'Resolve me', anchorX: 1, anchorY: 2 },
    });
    const commentId = createRes.json().comment.id;

    const resolveRes = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/v1/files/${fileId}/comments/${commentId}`,
      headers: { authorization: `Bearer ${viewerToken}` },
      payload: { resolved: true },
    });
    expect(resolveRes.statusCode).toBe(200);
    expect(resolveRes.json().comment.resolvedAt).not.toBeNull();

    const unresolveRes = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/v1/files/${fileId}/comments/${commentId}`,
      headers: { authorization: `Bearer ${viewerToken}` },
      payload: { resolved: false },
    });
    expect(unresolveRes.statusCode).toBe(200);
    expect(unresolveRes.json().comment.resolvedAt).toBeNull();
  });

  it('lets the author delete their own comment but forbids a non-author non-admin', async () => {
    const createRes = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/files/${fileId}/comments`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { body: 'Owner comment', anchorX: 5, anchorY: 5 },
    });
    const commentId = createRes.json().comment.id;

    // A VIEWER who is not the author cannot delete it.
    const viewerDeleteRes = await ctx.app.inject({
      method: 'DELETE',
      url: `/api/v1/files/${fileId}/comments/${commentId}`,
      headers: { authorization: `Bearer ${viewerToken}` },
    });
    expect(viewerDeleteRes.statusCode).toBe(403);

    // The author deletes it successfully.
    const ownerDeleteRes = await ctx.app.inject({
      method: 'DELETE',
      url: `/api/v1/files/${fileId}/comments/${commentId}`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(ownerDeleteRes.statusCode).toBe(204);
  });

  it('hides the thread from an outsider (non-member) on read and create — 404, not 403', async () => {
    // requireOrgRole returns 404 (not 403) for non-members so file existence
    // is never confirmed to outsiders.
    const listRes = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/files/${fileId}/comments`,
      headers: { authorization: `Bearer ${outsiderToken}` },
    });
    expect(listRes.statusCode).toBe(404);

    const createRes = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/files/${fileId}/comments`,
      headers: { authorization: `Bearer ${outsiderToken}` },
      payload: { body: 'sneaky', anchorX: 0, anchorY: 0 },
    });
    expect(createRes.statusCode).toBe(404);
  });
});
