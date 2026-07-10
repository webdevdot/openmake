import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { OpenDoc } from '@openmake/core';
import type { Database } from '@openmake/database';
import { buildTestApp, type TestApp } from './helpers.js';
import { resetDatabase } from './db-setup.js';
import { loadMergedYDoc } from '../services/doc-service.js';

/** Appends an "add node" edit to a file's log, mirroring a real collaborative edit. */
async function addNode(db: Database, fileId: string, type: string, name: string): Promise<void> {
  const ydoc = await loadMergedYDoc(db, fileId);
  const doc = OpenDoc.fromYDoc(ydoc);
  let update: Uint8Array | undefined;
  ydoc.on('update', (u: Uint8Array) => (update = u));
  doc.createNode({
    type: type as never,
    parentId: doc.getPages()[0]!,
    name,
    x: 0,
    y: 0,
    width: 10,
    height: 10,
  } as never);
  await db.docs.appendUpdate(fileId, update!);
}

async function nodeNames(app: TestApp, token: string, fileId: string): Promise<string[]> {
  const res = await app.app.inject({
    method: 'GET',
    url: `/api/v1/files/${fileId}/snapshot`,
    headers: { authorization: `Bearer ${token}` },
  });
  const ydoc = new Y.Doc();
  Y.applyUpdate(ydoc, new Uint8Array(res.rawPayload));
  return Object.values(OpenDoc.fromYDoc(ydoc).toJSON().nodes).map((n) => n.name);
}

describe('versions', () => {
  let ctx: TestApp;
  let accessToken: string; // owner (EDITOR+)
  let viewerToken: string;
  let outsiderToken: string;
  let projectId: string;

  async function newFile(name: string): Promise<string> {
    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/files`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { name },
    });
    return res.json().file.id;
  }

  beforeAll(async () => {
    ctx = await buildTestApp();
    await resetDatabase();

    const reg = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'ver-owner@example.com', password: 'supersecretpassword', name: 'Owner' },
    });
    accessToken = reg.json().accessToken;

    const outsider = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'ver-out@example.com', password: 'supersecretpassword', name: 'Outsider' },
    });
    outsiderToken = outsider.json().accessToken;

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

    const viewer = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'ver-viewer@example.com', password: 'supersecretpassword', name: 'Viewer' },
    });
    viewerToken = viewer.json().accessToken;
    await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/orgs/${orgId}/members`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { email: 'ver-viewer@example.com', role: 'VIEWER' },
    });
  });

  afterAll(async () => {
    await ctx.teardown();
  });

  it('creates a named version capturing the current seq', async () => {
    const fileId = await newFile('Versioned');
    await addNode(ctx.db, fileId, 'RECTANGLE', 'KeepMe');

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/files/${fileId}/versions`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { name: 'Checkpoint A' },
    });
    expect(res.statusCode).toBe(201);
    const version = res.json().version;
    expect(version.name).toBe('Checkpoint A');
    expect(version.seq).toBe(1);
    expect(typeof version.id).toBe('string');
  });

  it('lists versions newest-first with author, plus auto checkpoints', async () => {
    const fileId = await newFile('Listable');
    await addNode(ctx.db, fileId, 'RECTANGLE', 'R1');
    await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/files/${fileId}/versions`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { name: 'One' },
    });
    await addNode(ctx.db, fileId, 'ELLIPSE', 'E1');
    await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/files/${fileId}/versions`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { name: 'Two' },
    });

    const res = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/files/${fileId}/versions`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.versions.map((v: { name: string }) => v.name)).toEqual(['Two', 'One']);
    expect(body.versions[0].author.name).toBe('Owner');
    // Version creation writes a checkpoint snapshot, so auto checkpoints exist.
    expect(body.autoCheckpoints.length).toBeGreaterThan(0);
  });

  it('restores non-destructively: reverts content, appends a new update, deletes no history', async () => {
    const fileId = await newFile('Restorable');
    await addNode(ctx.db, fileId, 'RECTANGLE', 'KeepMe');

    const createRes = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/files/${fileId}/versions`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { name: 'Before ellipse' },
    });
    const versionId = createRes.json().version.id;

    await addNode(ctx.db, fileId, 'ELLIPSE', 'AddedLater');
    // Sanity: both nodes present before restore.
    const before = await nodeNames(ctx, accessToken, fileId);
    expect(before).toContain('KeepMe');
    expect(before).toContain('AddedLater');
    const updatesBefore = await ctx.db.docs.listUpdatesSince(fileId, 0);

    const restoreRes = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/files/${fileId}/versions/${versionId}/restore`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(restoreRes.statusCode).toBe(200);
    expect(restoreRes.json().version.id).toBe(versionId);

    // Content reverted to the checkpoint: ellipse gone, rectangle kept.
    const after = await nodeNames(ctx, accessToken, fileId);
    expect(after).toContain('KeepMe');
    expect(after).not.toContain('AddedLater');

    // Non-destructive: every pre-restore update still present, plus one NEW update.
    const updatesAfter = await ctx.db.docs.listUpdatesSince(fileId, 0);
    const seqsBefore = updatesBefore.map((u) => u.seq);
    const seqsAfter = updatesAfter.map((u) => u.seq);
    for (const seq of seqsBefore) expect(seqsAfter).toContain(seq);
    expect(updatesAfter.length).toBe(updatesBefore.length + 1);
  });

  it('404s for a missing version and a version belonging to another file', async () => {
    const fileA = await newFile('FileA');
    await addNode(ctx.db, fileA, 'RECTANGLE', 'A');
    const created = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/files/${fileA}/versions`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { name: 'A-version' },
    });
    const versionA = created.json().version.id;

    const fileB = await newFile('FileB');

    const missing = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/files/${fileA}/versions/nonexistent/restore`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(missing.statusCode).toBe(404);

    // Version A does not belong to file B → 404 (no cross-file leakage).
    const foreign = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/files/${fileB}/versions/${versionA}/restore`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(foreign.statusCode).toBe(404);
  });

  it('404s when creating a version on a soft-deleted file', async () => {
    const fileId = await newFile('ToDelete');
    await ctx.app.inject({
      method: 'DELETE',
      url: `/api/v1/files/${fileId}`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/files/${fileId}/versions`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { name: 'nope' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('enforces roles: VIEWER can list but not create/restore; outsiders get 404', async () => {
    const fileId = await newFile('RbacFile');
    await addNode(ctx.db, fileId, 'RECTANGLE', 'R');
    const created = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/files/${fileId}/versions`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { name: 'v' },
    });
    const versionId = created.json().version.id;

    // VIEWER: list ok (200), create/restore forbidden (403).
    const viewerList = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/files/${fileId}/versions`,
      headers: { authorization: `Bearer ${viewerToken}` },
    });
    expect(viewerList.statusCode).toBe(200);

    const viewerCreate = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/files/${fileId}/versions`,
      headers: { authorization: `Bearer ${viewerToken}` },
      payload: { name: 'nope' },
    });
    expect(viewerCreate.statusCode).toBe(403);

    const viewerRestore = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/files/${fileId}/versions/${versionId}/restore`,
      headers: { authorization: `Bearer ${viewerToken}` },
    });
    expect(viewerRestore.statusCode).toBe(403);

    // Outsider (non-member): everything 404 (don't confirm existence).
    const outsiderList = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/files/${fileId}/versions`,
      headers: { authorization: `Bearer ${outsiderToken}` },
    });
    expect(outsiderList.statusCode).toBe(404);

    const outsiderCreate = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/files/${fileId}/versions`,
      headers: { authorization: `Bearer ${outsiderToken}` },
      payload: { name: 'x' },
    });
    expect(outsiderCreate.statusCode).toBe(404);
  });
});
