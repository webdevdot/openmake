import type { AgentSpec, SkillSpec, WorkflowSpec } from '@openmake/ai';
import { OpenDoc } from '@openmake/core';
import { createId } from '@openmake/shared';
import type {
  ComponentRecord,
  ComponentSearchResult,
  DocumentStore,
  GeneratedCodeRecord,
  IntelligenceAttachment,
  IntelligenceStore,
} from './types.js';

/**
 * In-memory DocumentStore for tests and local/dev use. Documents are held as
 * live OpenDoc instances in a Map, keyed by fileId; `saveDocument` is a no-op
 * beyond bookkeeping since the same instance is already the source of truth.
 */
export class InMemoryDocumentStore implements DocumentStore {
  private readonly files = new Map<string, { name: string; projectId?: string; doc: OpenDoc }>();

  /** Seed a document for tests/dev; creates one via OpenDoc.create() if none given. */
  seed(fileId: string, opts: { name?: string; projectId?: string; doc?: OpenDoc } = {}): OpenDoc {
    const doc = opts.doc ?? OpenDoc.create({ id: fileId, name: opts.name ?? fileId });
    this.files.set(fileId, { name: opts.name ?? doc.name, projectId: opts.projectId, doc });
    return doc;
  }

  async listFiles(): Promise<Array<{ id: string; name: string; projectId?: string }>> {
    return Array.from(this.files.entries()).map(([id, entry]) => ({
      id,
      name: entry.name,
      projectId: entry.projectId,
    }));
  }

  async loadDocument(fileId: string): Promise<OpenDoc> {
    const entry = this.files.get(fileId);
    if (!entry) throw new Error(`File "${fileId}" does not exist`);
    return entry.doc;
  }

  async saveDocument(fileId: string, doc: OpenDoc): Promise<void> {
    const entry = this.files.get(fileId);
    if (!entry) throw new Error(`File "${fileId}" does not exist`);
    entry.doc = doc;
  }
}

interface ComponentEntry extends ComponentRecord {
  fileId: string;
  nodeId: string;
  description?: string;
}

/**
 * In-memory IntelligenceStore for tests and local/dev use. Skills/agents/
 * workflows are seedable arrays; components, attachments, and generated code
 * are held in Maps keyed by synthetic component ids.
 */
export class InMemoryIntelligenceStore implements IntelligenceStore {
  private skills: SkillSpec[] = [];
  private agents: AgentSpec[] = [];
  private workflows: WorkflowSpec[] = [];
  private readonly components = new Map<string, ComponentEntry>();
  private readonly componentsByNode = new Map<string, string>();
  private readonly attachments = new Map<string, IntelligenceAttachment[]>();
  private readonly generatedCode = new Map<string, GeneratedCodeRecord[]>();

  seedSkills(skills: SkillSpec[]): void {
    this.skills = skills;
  }

  seedAgents(agents: AgentSpec[]): void {
    this.agents = agents;
  }

  seedWorkflows(workflows: WorkflowSpec[]): void {
    this.workflows = workflows;
  }

  async listSkills(): Promise<SkillSpec[]> {
    return this.skills;
  }

  async listAgents(): Promise<AgentSpec[]> {
    return this.agents;
  }

  async listWorkflows(): Promise<WorkflowSpec[]> {
    return this.workflows;
  }

  private key(fileId: string, nodeId: string): string {
    return `${fileId}::${nodeId}`;
  }

  async getComponent(fileId: string, nodeId: string): Promise<ComponentRecord | null> {
    const componentId = this.componentsByNode.get(this.key(fileId, nodeId));
    if (!componentId) return null;
    const entry = this.components.get(componentId);
    if (!entry) return null;
    return { id: entry.id, name: entry.name, metadata: entry.metadata };
  }

  async upsertComponent(
    fileId: string,
    nodeId: string,
    data: { name: string; description?: string; metadata?: unknown },
  ): Promise<{ id: string }> {
    const nodeKey = this.key(fileId, nodeId);
    const existingId = this.componentsByNode.get(nodeKey);
    const id = existingId ?? createId('component');
    this.components.set(id, {
      id,
      fileId,
      nodeId,
      name: data.name,
      description: data.description,
      metadata: data.metadata,
    });
    this.componentsByNode.set(nodeKey, id);
    return { id };
  }

  async attachIntelligence(componentId: string, att: IntelligenceAttachment): Promise<void> {
    if (!this.components.has(componentId)) {
      throw new Error(`Component "${componentId}" does not exist`);
    }
    const list = this.attachments.get(componentId) ?? [];
    list.push(att);
    this.attachments.set(componentId, list);
  }

  async listAttachments(componentId: string): Promise<IntelligenceAttachment[]> {
    return this.attachments.get(componentId) ?? [];
  }

  async saveGeneratedCode(
    componentId: string,
    framework: string,
    code: string,
  ): Promise<{ version: number }> {
    const list = this.generatedCode.get(componentId) ?? [];
    const priorForFramework = list.filter((entry) => entry.framework === framework);
    const version = priorForFramework.length + 1;
    list.push({ framework, code, version });
    this.generatedCode.set(componentId, list);
    return { version };
  }

  async getGeneratedCode(componentId: string, framework?: string): Promise<GeneratedCodeRecord[]> {
    const list = this.generatedCode.get(componentId) ?? [];
    return framework ? list.filter((entry) => entry.framework === framework) : list;
  }

  async searchComponents(queryText: string): Promise<ComponentSearchResult[]> {
    const needle = queryText.trim().toLowerCase();
    if (!needle) return [];
    const results: ComponentSearchResult[] = [];
    for (const entry of this.components.values()) {
      if (entry.name.toLowerCase().includes(needle) || entry.description?.toLowerCase().includes(needle)) {
        results.push({ componentId: entry.id, name: entry.name, score: 1 });
      }
    }
    return results;
  }
}
