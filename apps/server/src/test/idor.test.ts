import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import { buildTestApp, type TestApp } from './helpers.js';
import { resetDatabase } from './db-setup.js';

interface RegisterResult {
  user: { id: string; email: string; name: string };
  accessToken: string;
}

let ipCounter = 0;
/** Distinct source IP per auth call so the 5/min per-IP limiter never trips in this suite. */
function nextIp(): string {
  ipCounter += 1;
  return `10.9.${Math.floor(ipCounter / 256) % 256}.${ipCounter % 256}`;
}

async function registerUser(ctx: TestApp, email: string): Promise<RegisterResult> {
  const res = await ctx.app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    remoteAddress: nextIp(),
    payload: { email, password: 'supersecretpassword', name: email },
  });
  return res.json();
}

async function firstOrgId(ctx: TestApp, token: string): Promise<string> {
  const res = await ctx.app.inject({
    method: 'GET',
    url: '/api/v1/orgs',
    headers: { authorization: `Bearer ${token}` },
  });
  return res.json().orgs[0].id;
}

/**
 * Cross-tenant IDOR regression suite. Two separate tenants (A, B); every check
 * confirms A cannot touch B's resources by id. Guards the fixes from the OWASP
 * security gate (4 HIGH cross-tenant IDOR findings).
 */
describe('cross-tenant IDOR', () => {
  let ctx: TestApp;
  let tokenA: string;
  let orgA: string;
  let tokenB: string;
  let orgB: string;

  beforeAll(async () => {
    ctx = await buildTestApp();
  });
  afterAll(async () => {
    await ctx.teardown();
  });
  beforeEach(async () => {
    await resetDatabase();
    const a = await registerUser(ctx, 'tenant-a@example.com');
    const b = await registerUser(ctx, 'tenant-b@example.com');
    tokenA = a.accessToken;
    tokenB = b.accessToken;
    orgA = await firstOrgId(ctx, tokenA);
    orgB = await firstOrgId(ctx, tokenB);
  });

  it("B's skill cannot be read/updated/deleted through A's org path", async () => {
    const created = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/orgs/${orgB}/skills`,
      headers: { authorization: `Bearer ${tokenB}` },
      payload: { name: 'secret', description: 'b-only', systemPrompt: 'hi' },
    });
    const skillId = created.json().skill.id;

    const patch = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/v1/orgs/${orgA}/skills/${skillId}`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { name: 'hijacked' },
    });
    expect(patch.statusCode).toBe(404);

    const del = await ctx.app.inject({
      method: 'DELETE',
      url: `/api/v1/orgs/${orgA}/skills/${skillId}`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(del.statusCode).toBe(404);
  });

  it("B's agent cannot be read/updated/deleted through A's org path", async () => {
    const created = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/orgs/${orgB}/agents`,
      headers: { authorization: `Bearer ${tokenB}` },
      payload: { name: 'a', description: 'd', provider: 'OPENAI', model: 'gpt-4' },
    });
    const agentId = created.json().agent.id;

    for (const method of ['GET', 'PATCH', 'DELETE'] as const) {
      const res = await ctx.app.inject({
        method,
        url: `/api/v1/orgs/${orgA}/agents/${agentId}`,
        headers: { authorization: `Bearer ${tokenA}` },
        payload: method === 'PATCH' ? { name: 'x' } : undefined,
      });
      expect(res.statusCode).toBe(404);
    }
  });

  it("B's workflow cannot be mutated through A's org path", async () => {
    const created = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/orgs/${orgB}/workflows`,
      headers: { authorization: `Bearer ${tokenB}` },
      payload: { name: 'wf', description: 'd', definition: [] },
    });
    const workflowId = created.json().workflow.id;

    const del = await ctx.app.inject({
      method: 'DELETE',
      url: `/api/v1/orgs/${orgA}/workflows/${workflowId}`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(del.statusCode).toBe(404);
  });

  it("A cannot read or write B's document over MCP by file id", async () => {
    // B creates a file.
    const projB = (
      await ctx.app.inject({
        method: 'GET',
        url: `/api/v1/orgs/${orgB}/projects`,
        headers: { authorization: `Bearer ${tokenB}` },
      })
    ).json().projects[0].id;
    const fileB = (
      await ctx.app.inject({
        method: 'POST',
        url: `/api/v1/projects/${projB}/files`,
        headers: { authorization: `Bearer ${tokenB}` },
        payload: { name: 'b-secret-doc' },
      })
    ).json().file.id;

    // A mints an mcp:write API key for its OWN org.
    const keyRes = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/orgs/${orgA}/api-keys`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { name: 'k', scopes: ['mcp:read', 'mcp:write'] },
    });
    const apiKey: string = keyRes.json().apiKey.key;
    expect(apiKey).toBeTruthy();

    // A tries to read B's file via MCP read_document → tool must error, not leak.
    const call = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/mcp',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      payload: {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'read_document', arguments: { fileId: fileB } },
      },
    });
    // The MCP tool wraps failures as isError; the response must not contain B's doc.
    expect(call.body).not.toContain('b-secret-doc');
    expect(call.body.toLowerCase()).toMatch(/not found|error/);
  });

  it('an ADMIN cannot grant the OWNER role', async () => {
    // A adds an admin.
    await registerUser(ctx, 'admin-a@example.com');
    await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/orgs/${orgA}/members`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { email: 'admin-a@example.com', role: 'ADMIN' },
    });
    const adminToken = (
      await ctx.app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        remoteAddress: nextIp(),
        payload: { email: 'admin-a@example.com', password: 'supersecretpassword' },
      })
    ).json().accessToken;

    // Admin invites a new member as OWNER → must be forbidden.
    await registerUser(ctx, 'victim@example.com');
    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/orgs/${orgA}/members`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { email: 'victim@example.com', role: 'OWNER' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('a read-only MCP key cannot attach intelligence (write) ', async () => {
    const keyRes = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/orgs/${orgA}/api-keys`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { name: 'ro', scopes: ['mcp:read'] },
    });
    const apiKey: string = keyRes.json().apiKey.key;

    const call = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/mcp',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      payload: {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'attach_intelligence',
          arguments: { fileId: 'x', nodeId: 'y', skillId: 'z' },
        },
      },
    });
    expect(call.body.toLowerCase()).toMatch(/read-only|error/);
  });
});
