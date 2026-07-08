import { buildDesignContext, type AiEngine } from '@openmake/ai';
import { NODE_TYPES, type CodegenFramework } from '@openmake/shared';
import { getGenerator } from '@openmake/codegen';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { readNodeToDepth, summarizeDocument } from './summaries.js';
import type { DocumentStore, IntelligenceStore } from './types.js';

export interface McpDeps {
  documents: DocumentStore;
  intelligence: IntelligenceStore;
  aiEngine?: AiEngine;
}

const NodeTypeSchema = z.enum(NODE_TYPES);

function ok(data: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

function fail(error: unknown): CallToolResult {
  const message = error instanceof Error ? error.message : String(error);
  return { isError: true, content: [{ type: 'text', text: message }] };
}

/**
 * Builds the openmake MCP server: read/write tools over OpenDoc documents,
 * component/intelligence metadata, deterministic codegen, and AI workflows.
 * All ports (documents, intelligence, aiEngine) are injected by the host.
 */
export function createOpenmakeMcpServer(deps: McpDeps): McpServer {
  const { documents, intelligence } = deps;
  const server = new McpServer({ name: 'openmake-mcp', version: '0.1.0' });

  server.registerTool(
    'list_files',
    {
      title: 'List files',
      description: 'List all documents (files) available in the current workspace/project.',
      inputSchema: {},
    },
    async () => {
      try {
        const files = await documents.listFiles();
        return ok({ files });
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'read_document',
    {
      title: 'Read document',
      description:
        "Read a document's metadata and page tree summary (page/frame/component ids, names, types, and child counts). Does NOT return the full node dump — use read_node for that.",
      inputSchema: { fileId: z.string() },
    },
    async ({ fileId }) => {
      try {
        const doc = await documents.loadDocument(fileId);
        return ok(summarizeDocument(doc));
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'read_node',
    {
      title: 'Read node',
      description:
        'Read a single node and its children up to a given depth (default 1 = direct children only). Use for inspecting a specific frame/component/instance without pulling the whole document.',
      inputSchema: {
        fileId: z.string(),
        nodeId: z.string(),
        depth: z.number().int().min(0).max(50).default(1),
      },
    },
    async ({ fileId, nodeId, depth }) => {
      try {
        const doc = await documents.loadDocument(fileId);
        return ok(readNodeToDepth(doc, nodeId, depth));
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'create_node',
    {
      title: 'Create node',
      description:
        'Create a new scene node (frame, text, rectangle, component, etc.) under a parent container.',
      inputSchema: {
        fileId: z.string(),
        parentId: z.string(),
        type: NodeTypeSchema,
        props: z.record(z.string(), z.unknown()).optional(),
      },
    },
    async ({ fileId, parentId, type, props }) => {
      try {
        const doc = await documents.loadDocument(fileId);
        const nodeId = doc.createNode({ type, parentId, ...(props ?? {}) });
        await documents.saveDocument(fileId, doc);
        return ok({ nodeId });
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'update_node',
    {
      title: 'Update node',
      description: 'Update properties on an existing node (position, size, fills, text, etc.).',
      inputSchema: {
        fileId: z.string(),
        nodeId: z.string(),
        props: z.record(z.string(), z.unknown()),
      },
    },
    async ({ fileId, nodeId, props }) => {
      try {
        const doc = await documents.loadDocument(fileId);
        doc.updateNode(nodeId, props);
        await documents.saveDocument(fileId, doc);
        return ok({ nodeId });
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'delete_node',
    {
      title: 'Delete node',
      description: 'Delete a node and its entire subtree.',
      inputSchema: { fileId: z.string(), nodeId: z.string() },
    },
    async ({ fileId, nodeId }) => {
      try {
        const doc = await documents.loadDocument(fileId);
        doc.deleteNode(nodeId);
        await documents.saveDocument(fileId, doc);
        return ok({ deleted: nodeId });
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'move_node',
    {
      title: 'Move node',
      description: 'Move a node to a new parent container, optionally at a specific child index.',
      inputSchema: {
        fileId: z.string(),
        nodeId: z.string(),
        newParentId: z.string(),
        index: z.number().int().min(0).optional(),
      },
    },
    async ({ fileId, nodeId, newParentId, index }) => {
      try {
        const doc = await documents.loadDocument(fileId);
        doc.moveNode(nodeId, newParentId, index);
        await documents.saveDocument(fileId, doc);
        return ok({ nodeId, newParentId });
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'create_component',
    {
      title: 'Create component',
      description:
        'Turn a frame into a reusable component (converts the node type to COMPONENT) and register it in the intelligence store.',
      inputSchema: { fileId: z.string(), nodeId: z.string() },
    },
    async ({ fileId, nodeId }) => {
      try {
        const doc = await documents.loadDocument(fileId);
        const componentNodeId = doc.createComponentFromNode(nodeId);
        await documents.saveDocument(fileId, doc);
        const node = doc.getNode(componentNodeId);
        const { id: componentId } = await intelligence.upsertComponent(fileId, componentNodeId, {
          name: node?.name ?? componentNodeId,
          description: node && 'description' in node ? node.description : undefined,
        });
        return ok({ nodeId: componentNodeId, componentId });
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'create_instance',
    {
      title: 'Create instance',
      description:
        'Create an instance of a component at a given position inside a parent container.',
      inputSchema: {
        fileId: z.string(),
        componentId: z.string(),
        parentId: z.string(),
        x: z.number(),
        y: z.number(),
      },
    },
    async ({ fileId, componentId, parentId, x, y }) => {
      try {
        const doc = await documents.loadDocument(fileId);
        const nodeId = doc.createInstance(componentId, parentId, { x, y });
        await documents.saveDocument(fileId, doc);
        return ok({ nodeId });
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'get_component_context',
    {
      title: 'Get component context',
      description:
        'Get the full AI-ready context bundle for a node: design context (selection, path, descendants, variables, styles), intelligence attachments, and generated code versions.',
      inputSchema: { fileId: z.string(), nodeId: z.string() },
    },
    async ({ fileId, nodeId }) => {
      try {
        const doc = await documents.loadDocument(fileId);
        const designContext = buildDesignContext(doc, [nodeId]);
        const component = await intelligence.getComponent(fileId, nodeId);
        const attachments = component ? await intelligence.listAttachments(component.id) : [];
        const generatedCode = component ? await intelligence.getGeneratedCode(component.id) : [];
        return ok({ designContext, component, attachments, generatedCode });
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'attach_intelligence',
    {
      title: 'Attach intelligence',
      description:
        'Attach a skill, agent, and/or workflow (plus optional prompts) to a node, auto-registering it as a component if needed. At least one of skillId/agentId/workflowId must be provided.',
      inputSchema: {
        fileId: z.string(),
        nodeId: z.string(),
        skillId: z.string().optional(),
        agentId: z.string().optional(),
        workflowId: z.string().optional(),
        prompts: z.unknown().optional(),
      },
    },
    async ({ fileId, nodeId, skillId, agentId, workflowId, prompts }) => {
      try {
        if (!skillId && !agentId && !workflowId) {
          throw new Error('At least one of skillId, agentId, or workflowId is required');
        }
        const doc = await documents.loadDocument(fileId);
        const node = doc.getNode(nodeId);
        if (!node) throw new Error(`Node "${nodeId}" does not exist`);

        let component = await intelligence.getComponent(fileId, nodeId);
        if (!component) {
          const { id } = await intelligence.upsertComponent(fileId, nodeId, { name: node.name });
          component = { id, name: node.name };
        }

        await intelligence.attachIntelligence(component.id, {
          skillId,
          agentId,
          workflowId,
          prompts,
        });
        return ok({ componentId: component.id });
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'list_skills',
    {
      title: 'List skills',
      description:
        'List all available Skills (system-prompt fragments an Agent can be composed from).',
      inputSchema: {},
    },
    async () => {
      try {
        return ok({ skills: await intelligence.listSkills() });
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'list_agents',
    {
      title: 'List agents',
      description: 'List all available Agents (model + skills configuration).',
      inputSchema: {},
    },
    async () => {
      try {
        return ok({ agents: await intelligence.listAgents() });
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'list_workflows',
    {
      title: 'List workflows',
      description: 'List all available Workflows (sequential multi-agent pipelines).',
      inputSchema: {},
    },
    async () => {
      try {
        return ok({ workflows: await intelligence.listWorkflows() });
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'run_workflow',
    {
      title: 'Run workflow',
      description:
        "Run a multi-agent Workflow against a node's design context and a user request, returning each step's output plus the final result. Requires the host to have configured an AI engine.",
      inputSchema: {
        workflowId: z.string(),
        fileId: z.string(),
        nodeId: z.string(),
        request: z.string(),
        framework: z.string().optional(),
      },
    },
    async ({ workflowId, fileId, nodeId, request, framework }) => {
      try {
        if (!deps.aiEngine) {
          return fail(
            'No AI engine is configured on this MCP server; run_workflow is unavailable.',
          );
        }
        const workflows = await intelligence.listWorkflows();
        const workflow = workflows.find((w) => w.id === workflowId);
        if (!workflow) throw new Error(`Workflow "${workflowId}" does not exist`);

        const doc = await documents.loadDocument(fileId);
        const designContext = buildDesignContext(doc, [nodeId]);

        const result = await deps.aiEngine.runWorkflow(workflow, {
          userRequest: request,
          designContext,
          framework,
        });
        return ok(result);
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'generate_code',
    {
      title: 'Generate code',
      description:
        'Deterministically generate framework code for a node via the codegen engine. Auto-saves the result as a new version when the node is a registered component.',
      inputSchema: {
        fileId: z.string(),
        nodeId: z.string(),
        framework: z.string(),
      },
    },
    async ({ fileId, nodeId, framework }) => {
      try {
        const doc = await documents.loadDocument(fileId);
        const designContext = buildDesignContext(doc, [nodeId]);
        const generator = getGenerator(framework as CodegenFramework);
        const files = generator.generate(designContext);

        const component = await intelligence.getComponent(fileId, nodeId);
        let version: number | undefined;
        if (component) {
          const code = JSON.stringify(files);
          const saved = await intelligence.saveGeneratedCode(component.id, framework, code);
          version = saved.version;
        }

        return ok({ files, version });
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'save_generated_code',
    {
      title: 'Save generated code',
      description:
        'Save a (possibly hand-edited) generated code string for a node as a new version.',
      inputSchema: {
        fileId: z.string(),
        nodeId: z.string(),
        framework: z.string(),
        code: z.string(),
      },
    },
    async ({ fileId, nodeId, framework, code }) => {
      try {
        const doc = await documents.loadDocument(fileId);
        const node = doc.getNode(nodeId);
        if (!node) throw new Error(`Node "${nodeId}" does not exist`);

        let component = await intelligence.getComponent(fileId, nodeId);
        if (!component) {
          const { id } = await intelligence.upsertComponent(fileId, nodeId, { name: node.name });
          component = { id, name: node.name };
        }

        const saved = await intelligence.saveGeneratedCode(component.id, framework, code);
        return ok({ componentId: component.id, version: saved.version });
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'get_generated_code',
    {
      title: 'Get generated code',
      description:
        'Get previously generated/saved code versions for a node, optionally filtered by framework.',
      inputSchema: {
        fileId: z.string(),
        nodeId: z.string(),
        framework: z.string().optional(),
      },
    },
    async ({ fileId, nodeId, framework }) => {
      try {
        const component = await intelligence.getComponent(fileId, nodeId);
        if (!component) return ok({ code: [] });
        const code = await intelligence.getGeneratedCode(component.id, framework);
        return ok({ code });
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'search_components',
    {
      title: 'Search components',
      description: 'Semantic/text search over registered components by name/description.',
      inputSchema: { query: z.string() },
    },
    async ({ query }) => {
      try {
        return ok({ results: await intelligence.searchComponents(query) });
      } catch (error) {
        return fail(error);
      }
    },
  );

  return server;
}
