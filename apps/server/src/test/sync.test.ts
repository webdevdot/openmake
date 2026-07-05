import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import WebSocket from 'ws';
import { CollabClient } from '@openmake/collab/client';
import { buildTestApp, type TestApp } from './helpers.js';
import { resetDatabase } from './db-setup.js';

function waitFor(fn: () => boolean, timeoutMs = 5000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      if (fn()) {
        resolve();
        return;
      }
      if (Date.now() - start > timeoutMs) {
        reject(new Error('waitFor: timed out'));
        return;
      }
      setTimeout(check, 25);
    };
    check();
  });
}

describe('sync (websocket)', () => {
  let ctx: TestApp;
  let baseWsUrl: string;
  let accessToken: string;
  let fileId: string;

  beforeAll(async () => {
    ctx = await buildTestApp();
    const address = await ctx.app.listen({ port: 0, host: '127.0.0.1' });
    baseWsUrl = address.replace('http://', 'ws://');
  });

  afterAll(async () => {
    await ctx.teardown();
  });

  beforeEach(async () => {
    await resetDatabase();

    const registerRes = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'syncuser@example.com', password: 'supersecretpassword', name: 'Sync User' },
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
    const projectId = projectsRes.json().projects[0].id;

    const createFileRes = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/files`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { name: 'Sync File' },
    });
    fileId = createFileRes.json().file.id;
  });

  it('two clients converge on a rectangle created by one of them', async () => {
    const docA = new Y.Doc();
    const docB = new Y.Doc();

    const clientA = new CollabClient(`${baseWsUrl}/sync`, fileId, docA, {
      WebSocketImpl: WebSocket as unknown as typeof globalThis.WebSocket,
      token: accessToken,
    });
    const clientB = new CollabClient(`${baseWsUrl}/sync`, fileId, docB, {
      WebSocketImpl: WebSocket as unknown as typeof globalThis.WebSocket,
      token: accessToken,
    });

    try {
      await new Promise<void>((resolve) => clientA.on('synced', resolve));
      await new Promise<void>((resolve) => clientB.on('synced', resolve));

      const nodesA = docA.getMap('nodes');
      docA.transact(() => {
        nodesA.set('rect-1', new Y.Map(Object.entries({ id: 'rect-1', type: 'RECTANGLE' })));
      });

      const nodesB = docB.getMap('nodes');
      await waitFor(() => nodesB.has('rect-1'));
      expect(nodesB.has('rect-1')).toBe(true);
    } finally {
      clientA.destroy();
      clientB.destroy();
    }
  });

  it('a socket connecting without a token is closed by the server', async () => {
    const closeInfo = await new Promise<{ code: number }>((resolve, reject) => {
      const ws = new WebSocket(`${baseWsUrl}/sync/${fileId}`);
      const timer = setTimeout(() => reject(new Error('timed out waiting for close')), 5000);
      ws.on('close', (code: number) => {
        clearTimeout(timer);
        resolve({ code });
      });
      ws.on('error', () => {
        // A close should follow; ignore transport-level error noise.
      });
    });
    expect(closeInfo.code).toBe(4001);
  });
});
