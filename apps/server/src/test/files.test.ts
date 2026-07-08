import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { OpenDoc } from '@openmake/core';
import { buildTestApp, type TestApp } from './helpers.js';
import { resetDatabase } from './db-setup.js';

describe('files', () => {
  let ctx: TestApp;
  let accessToken: string; // owner (EDITOR+)
  let viewerToken: string; // VIEWER-role member
  let outsiderToken: string; // non-member
  let orgId: string;
  let projectId: string;

  // The auth register/login routes are rate-limited to 5/min per app instance,
  // and the in-memory limiter isn't reset between tests. So all fixtures are
  // registered exactly once here (3 registers) and the DB is reset only once;
  // individual tests create/delete their own files and never re-register.
  beforeAll(async () => {
    ctx = await buildTestApp();
    await resetDatabase();

    const registerRes = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'filer@example.com', password: 'supersecretpassword', name: 'Filer' },
    });
    accessToken = registerRes.json().accessToken;

    const outsiderRes = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'outsider@example.com', password: 'supersecretpassword', name: 'Outsider' },
    });
    outsiderToken = outsiderRes.json().accessToken;

    const orgsRes = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/orgs',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    orgId = orgsRes.json().orgs[0].id;

    const projectsRes = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/orgs/${orgId}/projects`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    projectId = projectsRes.json().projects[0].id;

    // A VIEWER-role member of the owner's org.
    const viewerRes = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'viewer@example.com', password: 'supersecretpassword', name: 'Viewer' },
    });
    viewerToken = viewerRes.json().accessToken;
    await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/orgs/${orgId}/members`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { email: 'viewer@example.com', role: 'VIEWER' },
    });
  });

  afterAll(async () => {
    await ctx.teardown();
  });

  it('creates a file and its snapshot round-trips into a valid OpenDoc with 1 page', async () => {
    const createRes = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/files`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { name: 'My Design' },
    });
    expect(createRes.statusCode).toBe(201);
    const fileId = createRes.json().file.id;

    const snapshotRes = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/files/${fileId}/snapshot`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(snapshotRes.statusCode).toBe(200);

    const body = snapshotRes.rawPayload;
    const ydoc = new Y.Doc();
    Y.applyUpdate(ydoc, new Uint8Array(body));
    const doc = OpenDoc.fromYDoc(ydoc);
    expect(doc.getPages().length).toBe(1);
  });

  it('lists trashed files via ?deleted=1 and restores them', async () => {
    const createRes = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/files`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { name: 'Trash Me' },
    });
    const fileId = createRes.json().file.id;

    // Before deletion the trash list is empty and the live list contains it.
    const trashEmptyRes = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/projects/${projectId}/files?deleted=1`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(trashEmptyRes.statusCode).toBe(200);
    expect(trashEmptyRes.json().files.map((f: { id: string }) => f.id)).not.toContain(fileId);

    await ctx.app.inject({
      method: 'DELETE',
      url: `/api/v1/files/${fileId}`,
      headers: { authorization: `Bearer ${accessToken}` },
    });

    // Now it appears in the trash list but NOT in the live list.
    const trashRes = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/projects/${projectId}/files?deleted=1`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(trashRes.statusCode).toBe(200);
    expect(trashRes.json().files.map((f: { id: string }) => f.id)).toContain(fileId);

    const liveRes = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/projects/${projectId}/files`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(liveRes.json().files.map((f: { id: string }) => f.id)).not.toContain(fileId);

    // Restore clears deletedAt and the file returns to the live list.
    const restoreRes = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/files/${fileId}/restore`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(restoreRes.statusCode).toBe(200);
    expect(restoreRes.json().file.deletedAt).toBeNull();

    const relistedRes = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/projects/${projectId}/files`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(relistedRes.json().files.map((f: { id: string }) => f.id)).toContain(fileId);
  });

  it('restore returns 404 for a file that is not trashed', async () => {
    const createRes = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/files`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { name: 'Not Trashed' },
    });
    const fileId = createRes.json().file.id;

    const restoreRes = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/files/${fileId}/restore`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(restoreRes.statusCode).toBe(404);
  });

  it('a non-member gets 404 on trash-list and restore', async () => {
    const createRes = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/files`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { name: 'Owner File' },
    });
    const fileId = createRes.json().file.id;
    await ctx.app.inject({
      method: 'DELETE',
      url: `/api/v1/files/${fileId}`,
      headers: { authorization: `Bearer ${accessToken}` },
    });

    const trashRes = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/projects/${projectId}/files?deleted=1`,
      headers: { authorization: `Bearer ${outsiderToken}` },
    });
    expect(trashRes.statusCode).toBe(404);

    const restoreRes = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/files/${fileId}/restore`,
      headers: { authorization: `Bearer ${outsiderToken}` },
    });
    expect(restoreRes.statusCode).toBe(404);
  });

  it('a VIEWER member gets 403 on trash-list and restore', async () => {
    const createRes = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/files`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { name: 'To Trash' },
    });
    const fileId = createRes.json().file.id;
    await ctx.app.inject({
      method: 'DELETE',
      url: `/api/v1/files/${fileId}`,
      headers: { authorization: `Bearer ${accessToken}` },
    });

    const trashRes = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/projects/${projectId}/files?deleted=1`,
      headers: { authorization: `Bearer ${viewerToken}` },
    });
    expect(trashRes.statusCode).toBe(403);

    const restoreRes = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/files/${fileId}/restore`,
      headers: { authorization: `Bearer ${viewerToken}` },
    });
    expect(restoreRes.statusCode).toBe(403);
  });

  it('a soft-deleted file returns 404 on GET', async () => {
    const createRes = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/files`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { name: 'To Delete' },
    });
    const fileId = createRes.json().file.id;

    const deleteRes = await ctx.app.inject({
      method: 'DELETE',
      url: `/api/v1/files/${fileId}`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(deleteRes.statusCode).toBe(204);

    const getRes = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/files/${fileId}`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(getRes.statusCode).toBe(404);
  });
});
