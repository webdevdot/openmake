import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { OpenDoc } from '@openmake/core';
import { buildTestApp, type TestApp } from './helpers.js';
import { resetDatabase } from './db-setup.js';

describe('files', () => {
  let ctx: TestApp;
  let accessToken: string;
  let projectId: string;

  beforeAll(async () => {
    ctx = await buildTestApp();
  });

  afterAll(async () => {
    await ctx.teardown();
  });

  beforeEach(async () => {
    await resetDatabase();

    const registerRes = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'filer@example.com', password: 'supersecretpassword', name: 'Filer' },
    });
    accessToken = registerRes.json().accessToken;

    const orgsRes = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/orgs',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const orgId = orgsRes.json().orgs[0].id;

    const projectsRes = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/orgs/${orgId}/projects`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    projectId = projectsRes.json().projects[0].id;
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
