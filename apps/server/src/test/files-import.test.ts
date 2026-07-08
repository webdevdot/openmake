import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { OpenDoc } from '@openmake/core';
import {
  IMPORT_RATE_LIMIT_PER_MINUTE,
  MAX_IMPORT_BODY_BYTES,
  MAX_IMPORT_ENTRIES,
  MAX_IMPORT_NODES,
} from '../routes/files.js';
import { buildTestApp, type TestApp } from './helpers.js';
import { resetDatabase } from './db-setup.js';

interface RegisteredUser {
  accessToken: string;
  orgId: string;
  projectId: string;
}

let ipCounter = 0;
/**
 * Distinct source IP per auth/import call so the per-IP limiters (5/min on
 * auth, IMPORT_RATE_LIMIT_PER_MINUTE on import) never trip across this suite —
 * the in-memory rate-limit store is NOT reset between tests.
 */
function nextIp(): string {
  ipCounter += 1;
  return `10.11.${Math.floor(ipCounter / 256) % 256}.${ipCounter % 256}`;
}

async function registerUserWithProject(
  ctx: TestApp,
  email: string,
  name: string,
): Promise<RegisteredUser> {
  const registerRes = await ctx.app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    remoteAddress: nextIp(),
    payload: { email, password: 'supersecretpassword', name },
  });
  const accessToken = registerRes.json().accessToken as string;

  const orgsRes = await ctx.app.inject({
    method: 'GET',
    url: '/api/v1/orgs',
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const orgId = orgsRes.json().orgs[0].id as string;

  const projectsRes = await ctx.app.inject({
    method: 'GET',
    url: `/api/v1/orgs/${orgId}/projects`,
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const projectId = projectsRes.json().projects[0].id as string;

  return { accessToken, orgId, projectId };
}

describe('file import', () => {
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
    const user = await registerUserWithProject(ctx, 'importer@example.com', 'Importer');
    accessToken = user.accessToken;
    projectId = user.projectId;
  });

  it('imports a real document and its nodes round-trip through the stored snapshot', async () => {
    const source = OpenDoc.create({ name: 'Fixture' });
    const pageId = source.getPages()[0];
    expect(pageId).toBeDefined();
    const rectId = source.createNode({
      type: 'RECTANGLE',
      parentId: pageId!,
      name: 'Imported Rect',
      x: 10,
      y: 20,
      width: 120,
      height: 60,
    });
    const documentJson = source.toJSON();

    const importRes = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/files/import`,
      remoteAddress: nextIp(),
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { name: 'Imported Design', document: documentJson },
    });
    expect(importRes.statusCode).toBe(201);
    const file = importRes.json().file;
    expect(file.name).toBe('Imported Design');
    expect(file.projectId).toBe(projectId);

    const snapshotRes = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/files/${file.id}/snapshot`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(snapshotRes.statusCode).toBe(200);

    const ydoc = new Y.Doc();
    Y.applyUpdate(ydoc, new Uint8Array(snapshotRes.rawPayload));
    const imported = OpenDoc.fromYDoc(ydoc);

    expect(imported.getPages()).toEqual([pageId]);
    const rect = imported.getNode(rectId);
    expect(rect).toBeDefined();
    expect(rect!.type).toBe('RECTANGLE');
    expect(rect!.name).toBe('Imported Rect');
    expect(rect!.x).toBe(10);
    expect(rect!.y).toBe(20);
    expect(rect!.width).toBe(120);
    expect(rect!.height).toBe(60);
    expect(imported.getParentId(rectId)).toBe(pageId);
  });

  it('rejects an invalid document with INVALID_DOCUMENT and creates no file row', async () => {
    for (const document of [
      { schemaVersion: 2 },
      { schemaVersion: 1, nodes: 'nope' },
      'not-an-object',
    ]) {
      const res = await ctx.app.inject({
        method: 'POST',
        url: `/api/v1/projects/${projectId}/files/import`,
        remoteAddress: nextIp(),
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { name: 'Bad Import', document },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('INVALID_DOCUMENT');
    }

    const listRes = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/projects/${projectId}/files`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(listRes.statusCode).toBe(200);
    expect(listRes.json().files).toEqual([]);
  });

  it('returns 401 without an Authorization header', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/files/import`,
      remoteAddress: nextIp(),
      payload: { name: 'No Auth', document: OpenDoc.create({ name: 'X' }).toJSON() },
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 404 when a user from another org targets the first user's project", async () => {
    const outsider = await registerUserWithProject(ctx, 'outsider@example.com', 'Outsider');

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/files/import`,
      remoteAddress: nextIp(),
      headers: { authorization: `Bearer ${outsider.accessToken}` },
      payload: { name: 'Sneaky Import', document: OpenDoc.create({ name: 'X' }).toJSON() },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('NOT_FOUND');
  });

  it('rejects documents over the node-count cap with DOCUMENT_TOO_LARGE before hydration', async () => {
    // The guard counts keys before any schema validation, so tiny placeholder
    // values keep the payload small while still exceeding MAX_IMPORT_NODES.
    const nodes: Record<string, number> = {};
    for (let i = 0; i <= MAX_IMPORT_NODES; i++) nodes[`n${i}`] = 0;

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/files/import`,
      remoteAddress: nextIp(),
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        name: 'Huge Import',
        document: { schemaVersion: 1, id: 'doc', name: 'Huge', rootId: 'root', nodes },
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('DOCUMENT_TOO_LARGE');

    const listRes = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/projects/${projectId}/files`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(listRes.json().files).toEqual([]);
  });

  it('rejects documents whose styles (not nodes) blow the entry cap, before hydration', async () => {
    // Only 1 node — trivially passes the node-count guard — but a styles map
    // large enough that hydration cost would rival a max-node document.
    // The combined-entries guard must catch it with tiny placeholder values,
    // i.e. before any schema validation or Y.Doc hydration.
    const styles: Record<string, number> = {};
    for (let i = 0; i <= MAX_IMPORT_ENTRIES; i++) styles[`s${i}`] = 0;

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/files/import`,
      remoteAddress: nextIp(),
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        name: 'Style Bomb',
        document: {
          schemaVersion: 1,
          id: 'doc',
          name: 'Bomb',
          rootId: 'root',
          nodes: { root: 0 },
          styles,
        },
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('DOCUMENT_TOO_LARGE');

    const listRes = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/projects/${projectId}/files`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(listRes.json().files).toEqual([]);
  });

  it('rejects bodies over MAX_IMPORT_BODY_BYTES with 413', async () => {
    const padding = 'x'.repeat(MAX_IMPORT_BODY_BYTES);
    const rawBody = `{"name":"Too Big","document":{"schemaVersion":1,"pad":"${padding}"}}`;

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/files/import`,
      remoteAddress: nextIp(),
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      payload: rawBody,
    });
    expect(res.statusCode).toBe(413);
  });

  it(`throttles imports per IP after ${IMPORT_RATE_LIMIT_PER_MINUTE}/min with 429`, async () => {
    const ip = nextIp();
    const documentJson = OpenDoc.create({ name: 'Throttled' }).toJSON();

    for (let i = 0; i < IMPORT_RATE_LIMIT_PER_MINUTE; i++) {
      const res = await ctx.app.inject({
        method: 'POST',
        url: `/api/v1/projects/${projectId}/files/import`,
        remoteAddress: ip,
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { name: `Burst ${i}`, document: documentJson },
      });
      expect(res.statusCode).toBe(201);
    }

    const blocked = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/files/import`,
      remoteAddress: ip,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { name: 'Burst overflow', document: documentJson },
    });
    expect(blocked.statusCode).toBe(429);
  });
});
