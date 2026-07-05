import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { AgentSpec, ModelPort, WorkflowSpec } from '@openmake/ai';
import { AiEngine } from '@openmake/ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InMemoryDocumentStore, InMemoryIntelligenceStore } from '../src/memory-stores.js';
import { createOpenmakeMcpServer } from '../src/server.js';

async function connectedClient(server: ReturnType<typeof createOpenmakeMcpServer>) {
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  return client;
}

function parseResult(result: Awaited<ReturnType<Client['callTool']>>): unknown {
  const content = result.content as Array<{ type: string; text?: string }>;
  const first = content[0];
  if (!first || first.type !== 'text' || typeof first.text !== 'string') {
    throw new Error('Expected text content in tool result');
  }
  return JSON.parse(first.text);
}

describe('createOpenmakeMcpServer', () => {
  let documents: InMemoryDocumentStore;
  let intelligence: InMemoryIntelligenceStore;

  beforeEach(() => {
    documents = new InMemoryDocumentStore();
    intelligence = new InMemoryIntelligenceStore();
  });

  it('list_files returns seeded files', async () => {
    documents.seed('file1', { name: 'My File' });
    const server = createOpenmakeMcpServer({ documents, intelligence });
    const client = await connectedClient(server);

    const result = await client.callTool({ name: 'list_files', arguments: {} });
    const data = parseResult(result) as { files: Array<{ id: string; name: string }> };
    expect(data.files).toEqual([{ id: 'file1', name: 'My File', projectId: undefined }]);
  });

  it('read_document returns a page-tree summary, not full node dump', async () => {
    const doc = documents.seed('file1', { name: 'My File' });
    const pageId = doc.getPages()[0]!;
    doc.createNode({ type: 'FRAME', parentId: pageId, name: 'Frame 1' });

    const server = createOpenmakeMcpServer({ documents, intelligence });
    const client = await connectedClient(server);

    const result = await client.callTool({ name: 'read_document', arguments: { fileId: 'file1' } });
    const data = parseResult(result) as {
      id: string;
      name: string;
      pages: Array<{ id: string; children: Array<{ name: string; type: string }> }>;
    };
    expect(data.id).toBe('file1');
    expect(data.name).toBe('My File');
    expect(data.pages).toHaveLength(1);
    expect(data.pages[0]!.children).toEqual([
      expect.objectContaining({ name: 'Frame 1', type: 'FRAME', childCount: 0 }),
    ]);
  });

  it('read_node returns a node and its children to the requested depth', async () => {
    const doc = documents.seed('file1');
    const pageId = doc.getPages()[0]!;
    const frameId = doc.createNode({ type: 'FRAME', parentId: pageId, name: 'Frame' });
    doc.createNode({ type: 'TEXT', parentId: frameId, name: 'Label' });

    const server = createOpenmakeMcpServer({ documents, intelligence });
    const client = await connectedClient(server);

    const result = await client.callTool({
      name: 'read_node',
      arguments: { fileId: 'file1', nodeId: frameId, depth: 1 },
    });
    const data = parseResult(result) as { node: { name: string }; children: Array<{ node: { name: string } }> };
    expect(data.node.name).toBe('Frame');
    expect(data.children).toHaveLength(1);
    expect(data.children[0]!.node.name).toBe('Label');
  });

  it('create_node then read_node roundtrips and calls saveDocument', async () => {
    const doc = documents.seed('file1');
    const pageId = doc.getPages()[0]!;
    const saveSpy = vi.spyOn(documents, 'saveDocument');

    const server = createOpenmakeMcpServer({ documents, intelligence });
    const client = await connectedClient(server);

    const createResult = await client.callTool({
      name: 'create_node',
      arguments: { fileId: 'file1', parentId: pageId, type: 'RECTANGLE', props: { name: 'Box' } },
    });
    const { nodeId } = parseResult(createResult) as { nodeId: string };
    expect(nodeId).toBeTruthy();
    expect(saveSpy).toHaveBeenCalledWith('file1', doc);

    const readResult = await client.callTool({
      name: 'read_node',
      arguments: { fileId: 'file1', nodeId },
    });
    const { node } = parseResult(readResult) as { node: { name: string; type: string } };
    expect(node.name).toBe('Box');
    expect(node.type).toBe('RECTANGLE');
  });

  it('update_node updates props and returns error for missing node', async () => {
    const doc = documents.seed('file1');
    const pageId = doc.getPages()[0]!;
    const nodeId = doc.createNode({ type: 'TEXT', parentId: pageId, name: 'Original' });

    const server = createOpenmakeMcpServer({ documents, intelligence });
    const client = await connectedClient(server);

    const result = await client.callTool({
      name: 'update_node',
      arguments: { fileId: 'file1', nodeId, props: { name: 'Updated' } },
    });
    expect(result.isError).toBeFalsy();
    expect(doc.getNode(nodeId)?.name).toBe('Updated');

    const errorResult = await client.callTool({
      name: 'update_node',
      arguments: { fileId: 'file1', nodeId: 'missing', props: { name: 'x' } },
    });
    expect(errorResult.isError).toBe(true);
    const content = errorResult.content as Array<{ text: string }>;
    expect(content[0]!.text).toMatch(/does not exist/);
  });

  it('delete_node removes the node; errors for missing node', async () => {
    const doc = documents.seed('file1');
    const pageId = doc.getPages()[0]!;
    const nodeId = doc.createNode({ type: 'TEXT', parentId: pageId, name: 'Doomed' });

    const server = createOpenmakeMcpServer({ documents, intelligence });
    const client = await connectedClient(server);

    const result = await client.callTool({ name: 'delete_node', arguments: { fileId: 'file1', nodeId } });
    expect(result.isError).toBeFalsy();
    expect(doc.getNode(nodeId)).toBeUndefined();

    const errorResult = await client.callTool({
      name: 'delete_node',
      arguments: { fileId: 'file1', nodeId },
    });
    expect(errorResult.isError).toBe(true);
  });

  it('move_node relocates a node; errors for missing target', async () => {
    const doc = documents.seed('file1');
    const pageId = doc.getPages()[0]!;
    const frameA = doc.createNode({ type: 'FRAME', parentId: pageId, name: 'A' });
    const frameB = doc.createNode({ type: 'FRAME', parentId: pageId, name: 'B' });
    const child = doc.createNode({ type: 'TEXT', parentId: frameA, name: 'Child' });

    const server = createOpenmakeMcpServer({ documents, intelligence });
    const client = await connectedClient(server);

    const result = await client.callTool({
      name: 'move_node',
      arguments: { fileId: 'file1', nodeId: child, newParentId: frameB },
    });
    expect(result.isError).toBeFalsy();
    expect(doc.getParentId(child)).toBe(frameB);

    const errorResult = await client.callTool({
      name: 'move_node',
      arguments: { fileId: 'file1', nodeId: child, newParentId: 'missing' },
    });
    expect(errorResult.isError).toBe(true);
  });

  it('create_component + attach_intelligence + get_component_context returns full bundle', async () => {
    const doc = documents.seed('file1');
    const pageId = doc.getPages()[0]!;
    const frameId = doc.createNode({ type: 'FRAME', parentId: pageId, name: 'Button' });

    const server = createOpenmakeMcpServer({ documents, intelligence });
    const client = await connectedClient(server);

    const componentResult = await client.callTool({
      name: 'create_component',
      arguments: { fileId: 'file1', nodeId: frameId },
    });
    const { componentId } = parseResult(componentResult) as { componentId: string };
    expect(componentId).toBeTruthy();
    expect(doc.getNode(frameId)?.type).toBe('COMPONENT');

    const attachResult = await client.callTool({
      name: 'attach_intelligence',
      arguments: { fileId: 'file1', nodeId: frameId, skillId: 'skill-1', prompts: { tone: 'friendly' } },
    });
    expect(attachResult.isError).toBeFalsy();

    const contextResult = await client.callTool({
      name: 'get_component_context',
      arguments: { fileId: 'file1', nodeId: frameId },
    });
    const bundle = parseResult(contextResult) as {
      designContext: { document: { id: string }; selection: unknown[] };
      component: { id: string } | null;
      attachments: Array<{ skillId?: string }>;
      generatedCode: unknown[];
    };
    expect(bundle.designContext.document.id).toBe('file1');
    expect(bundle.designContext.selection).toHaveLength(1);
    expect(bundle.component?.id).toBe(componentId);
    expect(bundle.attachments).toEqual([{ skillId: 'skill-1', agentId: undefined, workflowId: undefined, prompts: { tone: 'friendly' } }]);
    expect(bundle.generatedCode).toEqual([]);
  });

  it('attach_intelligence requires at least one target', async () => {
    const doc = documents.seed('file1');
    const pageId = doc.getPages()[0]!;
    const nodeId = doc.createNode({ type: 'FRAME', parentId: pageId, name: 'F' });

    const server = createOpenmakeMcpServer({ documents, intelligence });
    const client = await connectedClient(server);

    const result = await client.callTool({
      name: 'attach_intelligence',
      arguments: { fileId: 'file1', nodeId },
    });
    expect(result.isError).toBe(true);
  });

  it('generate_code returns React file content and records a version for a registered component', async () => {
    const doc = documents.seed('file1');
    const pageId = doc.getPages()[0]!;
    const frameId = doc.createNode({ type: 'FRAME', parentId: pageId, name: 'Card' });

    const server = createOpenmakeMcpServer({ documents, intelligence });
    const client = await connectedClient(server);

    await client.callTool({ name: 'create_component', arguments: { fileId: 'file1', nodeId: frameId } });

    const result = await client.callTool({
      name: 'generate_code',
      arguments: { fileId: 'file1', nodeId: frameId, framework: 'REACT' },
    });
    const data = parseResult(result) as { files: Array<{ path: string; content: string }>; version: number };
    expect(data.files.length).toBeGreaterThan(0);
    expect(data.files[0]!.content).toBeTruthy();
    expect(data.version).toBe(1);

    const codeResult = await client.callTool({
      name: 'get_generated_code',
      arguments: { fileId: 'file1', nodeId: frameId },
    });
    const codeData = parseResult(codeResult) as { code: Array<{ framework: string; version: number }> };
    expect(codeData.code).toEqual([{ framework: 'REACT', code: expect.any(String), version: 1 }]);
  });

  it('save_generated_code stores hand-edited code as a new version', async () => {
    const doc = documents.seed('file1');
    const pageId = doc.getPages()[0]!;
    const nodeId = doc.createNode({ type: 'FRAME', parentId: pageId, name: 'Card' });

    const server = createOpenmakeMcpServer({ documents, intelligence });
    const client = await connectedClient(server);

    const result = await client.callTool({
      name: 'save_generated_code',
      arguments: { fileId: 'file1', nodeId, framework: 'REACT', code: 'export default function Card() {}' },
    });
    const data = parseResult(result) as { componentId: string; version: number };
    expect(data.version).toBe(1);

    const getResult = await client.callTool({
      name: 'get_generated_code',
      arguments: { fileId: 'file1', nodeId, framework: 'REACT' },
    });
    const getData = parseResult(getResult) as { code: Array<{ code: string }> };
    expect(getData.code[0]!.code).toBe('export default function Card() {}');
  });

  it('list_skills, list_agents, list_workflows delegate to the intelligence store', async () => {
    intelligence.seedSkills([{ id: 'skill-1', name: 'Skill One', systemPrompt: 'Be nice' }]);
    intelligence.seedAgents([
      { id: 'agent-1', name: 'Agent One', model: { provider: 'ANTHROPIC', model: 'claude' }, skills: [] },
    ]);
    intelligence.seedWorkflows([{ id: 'wf-1', name: 'Workflow One', steps: [] }]);

    const server = createOpenmakeMcpServer({ documents, intelligence });
    const client = await connectedClient(server);

    const skills = parseResult(await client.callTool({ name: 'list_skills', arguments: {} })) as {
      skills: Array<{ id: string }>;
    };
    expect(skills.skills).toEqual([expect.objectContaining({ id: 'skill-1' })]);

    const agents = parseResult(await client.callTool({ name: 'list_agents', arguments: {} })) as {
      agents: Array<{ id: string }>;
    };
    expect(agents.agents).toEqual([expect.objectContaining({ id: 'agent-1' })]);

    const workflows = parseResult(await client.callTool({ name: 'list_workflows', arguments: {} })) as {
      workflows: Array<{ id: string }>;
    };
    expect(workflows.workflows).toEqual([expect.objectContaining({ id: 'wf-1' })]);
  });

  it('run_workflow returns an error result when no aiEngine is configured', async () => {
    intelligence.seedWorkflows([{ id: 'wf-1', name: 'Workflow One', steps: [] }]);
    const doc = documents.seed('file1');
    const pageId = doc.getPages()[0]!;
    const nodeId = doc.createNode({ type: 'FRAME', parentId: pageId, name: 'F' });

    const server = createOpenmakeMcpServer({ documents, intelligence });
    const client = await connectedClient(server);

    const result = await client.callTool({
      name: 'run_workflow',
      arguments: { workflowId: 'wf-1', fileId: 'file1', nodeId, request: 'do something' },
    });
    expect(result.isError).toBe(true);
  });

  it('run_workflow chains steps and returns final output using a stubbed AiEngine port', async () => {
    const doc = documents.seed('file1');
    const pageId = doc.getPages()[0]!;
    const nodeId = doc.createNode({ type: 'FRAME', parentId: pageId, name: 'F' });

    const agent: AgentSpec = {
      id: 'agent-1',
      name: 'Agent One',
      model: { provider: 'ANTHROPIC', model: 'claude' },
      skills: [{ id: 'skill-1', name: 'Skill', systemPrompt: 'System prompt' }],
    };
    const workflow: WorkflowSpec = { id: 'wf-1', name: 'Workflow One', steps: [{ agent }] };
    intelligence.seedWorkflows([workflow]);

    const stubPort: ModelPort = {
      generateText: vi.fn(async (opts) => ({ text: `stub-response:${opts.prompt.slice(0, 10)}` })),
      generateObject: vi.fn(async () => {
        throw new Error('not used');
      }),
    };
    const aiEngine = new AiEngine(() => stubPort);

    const server = createOpenmakeMcpServer({ documents, intelligence, aiEngine });
    const client = await connectedClient(server);

    const result = await client.callTool({
      name: 'run_workflow',
      arguments: { workflowId: 'wf-1', fileId: 'file1', nodeId, request: 'do something' },
    });
    expect(result.isError).toBeFalsy();
    const data = parseResult(result) as { steps: Array<{ agentId: string; output: string }>; final: string };
    expect(data.steps).toHaveLength(1);
    expect(data.steps[0]!.agentId).toBe('agent-1');
    expect(data.final).toBe(data.steps[0]!.output);
    expect(stubPort.generateText).toHaveBeenCalledTimes(1);
  });

  it('search_components delegates to the intelligence store', async () => {
    const doc = documents.seed('file1');
    const pageId = doc.getPages()[0]!;
    const nodeId = doc.createNode({ type: 'FRAME', parentId: pageId, name: 'PrimaryButton' });

    const server = createOpenmakeMcpServer({ documents, intelligence });
    const client = await connectedClient(server);

    await client.callTool({ name: 'create_component', arguments: { fileId: 'file1', nodeId } });

    const result = await client.callTool({ name: 'search_components', arguments: { query: 'button' } });
    const data = parseResult(result) as { results: Array<{ name: string }> };
    expect(data.results).toEqual([expect.objectContaining({ name: 'PrimaryButton' })]);
  });

  it('create_instance creates an instance of a component', async () => {
    const doc = documents.seed('file1');
    const pageId = doc.getPages()[0]!;
    const frameId = doc.createNode({ type: 'FRAME', parentId: pageId, name: 'Button', width: 80, height: 32 });

    const server = createOpenmakeMcpServer({ documents, intelligence });
    const client = await connectedClient(server);

    await client.callTool({ name: 'create_component', arguments: { fileId: 'file1', nodeId: frameId } });

    const result = await client.callTool({
      name: 'create_instance',
      arguments: { fileId: 'file1', componentId: frameId, parentId: pageId, x: 10, y: 20 },
    });
    const { nodeId } = parseResult(result) as { nodeId: string };
    const instanceNode = doc.getNode(nodeId);
    expect(instanceNode?.type).toBe('INSTANCE');
    expect(instanceNode?.x).toBe(10);
    expect(instanceNode?.y).toBe(20);
  });

  it('reading an unknown file returns an isError tool result rather than throwing', async () => {
    const server = createOpenmakeMcpServer({ documents, intelligence });
    const client = await connectedClient(server);

    const result = await client.callTool({ name: 'read_document', arguments: { fileId: 'nope' } });
    expect(result.isError).toBe(true);
  });
});
