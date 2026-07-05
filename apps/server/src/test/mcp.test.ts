import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import * as Y from 'yjs';
import { OpenDoc } from '@openmake/core';
import { buildTestApp, type TestApp } from './helpers.js';
import { resetDatabase } from './db-setup.js';

describe('mcp', () => {
  let ctx: TestApp;
  let baseUrl: string;
  let accessToken: string;
  let orgId: string;
  let projectId: string;

  beforeAll(async () => {
    ctx = await buildTestApp();
    const address = await ctx.app.listen({ port: 0, host: '127.0.0.1' });
    baseUrl = address;
  });

  afterAll(async () => {
    await ctx.teardown();
  });

  beforeEach(async () => {
    await resetDatabase();

    const registerRes = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'mcpuser@example.com', password: 'supersecretpassword', name: 'MCP User' },
    });
    accessToken = registerRes.json().accessToken;

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
  });

  async function createApiKey(scopes: string[]): Promise<string> {
    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/orgs/${orgId}/api-keys`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { name: 'test key', scopes },
    });
    return res.json().apiKey.key as string;
  }

  it('lists tools including create_node/read_node, and round-trips a create->read through Postgres', async () => {
    const apiKey = await createApiKey(['mcp:read', 'mcp:write']);

    const createFileRes = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/files`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { name: 'MCP File' },
    });
    const fileId = createFileRes.json().file.id;

    const snapshotRes = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/files/${fileId}/snapshot`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const ydoc = new Y.Doc();
    Y.applyUpdate(ydoc, new Uint8Array(snapshotRes.rawPayload));
    const doc = OpenDoc.fromYDoc(ydoc);
    const pageId = doc.getPages()[0]!;

    const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`), {
      requestInit: { headers: { authorization: `Bearer ${apiKey}` } },
    });
    const client = new Client({ name: 'test-client', version: '0.1.0' });
    await client.connect(transport);

    const tools = await client.listTools();
    const toolNames = tools.tools.map((t) => t.name);
    expect(toolNames).toContain('create_node');
    expect(toolNames).toContain('read_node');

    const createResult = await client.callTool({
      name: 'create_node',
      arguments: { fileId, parentId: pageId, type: 'RECTANGLE' },
    });
    expect(createResult.isError).toBeFalsy();
    const createContent = (createResult.content as Array<{ type: string; text: string }>)[0]!;
    const { nodeId } = JSON.parse(createContent.text);
    expect(nodeId).toBeTruthy();

    await client.close();

    // Fresh connection + fresh loadDocument to prove persistence actually round-tripped through Postgres.
    const transport2 = new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`), {
      requestInit: { headers: { authorization: `Bearer ${apiKey}` } },
    });
    const client2 = new Client({ name: 'test-client-2', version: '0.1.0' });
    await client2.connect(transport2);

    const readResult = await client2.callTool({
      name: 'read_node',
      arguments: { fileId, nodeId, depth: 0 },
    });
    expect(readResult.isError).toBeFalsy();
    const readContent = (readResult.content as Array<{ type: string; text: string }>)[0]!;
    const readResultBody = JSON.parse(readContent.text);
    expect(readResultBody.node.id).toBe(nodeId);

    await client2.close();
  });

  it('read-only (mcp:read only) key cannot save documents via write tools', async () => {
    const apiKey = await createApiKey(['mcp:read']);

    const createFileRes = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/files`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { name: 'Read Only File' },
    });
    const fileId = createFileRes.json().file.id;

    const snapshotRes = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/files/${fileId}/snapshot`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const ydoc = new Y.Doc();
    Y.applyUpdate(ydoc, new Uint8Array(snapshotRes.rawPayload));
    const doc = OpenDoc.fromYDoc(ydoc);
    const pageId = doc.getPages()[0]!;

    const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`), {
      requestInit: { headers: { authorization: `Bearer ${apiKey}` } },
    });
    const client = new Client({ name: 'test-client-readonly', version: '0.1.0' });
    await client.connect(transport);

    const result = await client.callTool({
      name: 'create_node',
      arguments: { fileId, parentId: pageId, type: 'RECTANGLE' },
    });
    expect(result.isError).toBe(true);

    await client.close();
  });
});
