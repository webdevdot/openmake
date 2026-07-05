import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import { buildTestApp, type TestApp } from './helpers.js';
import { resetDatabase } from './db-setup.js';

interface RegisterResult {
  user: { id: string; email: string; name: string };
  accessToken: string;
  refreshToken: string;
}

async function registerUser(ctx: TestApp, email: string, name: string): Promise<RegisterResult> {
  const res = await ctx.app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: { email, password: 'supersecretpassword', name },
  });
  return res.json();
}

describe('rbac', () => {
  let ctx: TestApp;

  beforeAll(async () => {
    ctx = await buildTestApp();
  });

  afterAll(async () => {
    await ctx.teardown();
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  it('a VIEWER can read files but a 403 on write; a non-member gets 404', async () => {
    const owner = await registerUser(ctx, 'owner@example.com', 'Owner');
    const viewer = await registerUser(ctx, 'viewer@example.com', 'Viewer');
    const outsider = await registerUser(ctx, 'outsider@example.com', 'Outsider');

    const orgsRes = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/orgs',
      headers: { authorization: `Bearer ${owner.accessToken}` },
    });
    const { orgs } = orgsRes.json();
    const orgId = orgs[0].id;

    const projectsRes = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/orgs/${orgId}/projects`,
      headers: { authorization: `Bearer ${owner.accessToken}` },
    });
    const projectId = projectsRes.json().projects[0].id;

    // Add viewer as VIEWER-role member.
    await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/orgs/${orgId}/members`,
      headers: { authorization: `Bearer ${owner.accessToken}` },
      payload: { email: 'viewer@example.com', role: 'VIEWER' },
    });

    // Viewer can read the project's files.
    const readRes = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/projects/${projectId}/files`,
      headers: { authorization: `Bearer ${viewer.accessToken}` },
    });
    expect(readRes.statusCode).toBe(200);

    // Viewer cannot create a file (insufficient role -> 403, since they ARE a member).
    const writeRes = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/files`,
      headers: { authorization: `Bearer ${viewer.accessToken}` },
      payload: { name: 'New File' },
    });
    expect(writeRes.statusCode).toBe(403);

    // A file created by the owner, then a non-member trying to read it -> 404.
    const createRes = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/files`,
      headers: { authorization: `Bearer ${owner.accessToken}` },
      payload: { name: 'Owner File' },
    });
    const fileId = createRes.json().file.id;

    const outsiderRes = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/files/${fileId}`,
      headers: { authorization: `Bearer ${outsider.accessToken}` },
    });
    expect(outsiderRes.statusCode).toBe(404);
  });
});
