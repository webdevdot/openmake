import type { AgentSpec, SkillSpec, WorkflowSpec } from '@openmake/ai';
import type { OpenDoc } from '@openmake/core';

/**
 * Persistence port for OpenDoc documents. The host (apps/server or the stdio
 * launcher) wires this to whatever storage backs a "file" (Postgres, disk, …).
 */
export interface DocumentStore {
  listFiles(): Promise<Array<{ id: string; name: string; projectId?: string }>>;
  loadDocument(fileId: string): Promise<OpenDoc>;
  saveDocument(fileId: string, doc: OpenDoc): Promise<void>;
}

export interface ComponentRecord {
  id: string;
  name: string;
  metadata?: unknown;
}

export interface IntelligenceAttachment {
  skillId?: string;
  agentId?: string;
  workflowId?: string;
  prompts?: unknown;
}

export interface GeneratedCodeRecord {
  framework: string;
  code: string;
  version: number;
}

export interface ComponentSearchResult {
  componentId: string;
  name: string;
  score: number;
}

/**
 * Metadata + generated-code persistence port. Backed by pgvector-capable
 * storage in the real host; `searchComponents` may return `[]` if the host
 * has no vector index configured yet.
 */
export interface IntelligenceStore {
  listSkills(): Promise<SkillSpec[]>;
  listAgents(): Promise<AgentSpec[]>;
  listWorkflows(): Promise<WorkflowSpec[]>;
  getComponent(fileId: string, nodeId: string): Promise<ComponentRecord | null>;
  upsertComponent(
    fileId: string,
    nodeId: string,
    data: { name: string; description?: string; metadata?: unknown },
  ): Promise<{ id: string }>;
  attachIntelligence(componentId: string, att: IntelligenceAttachment): Promise<void>;
  listAttachments(componentId: string): Promise<IntelligenceAttachment[]>;
  saveGeneratedCode(componentId: string, framework: string, code: string): Promise<{ version: number }>;
  getGeneratedCode(componentId: string, framework?: string): Promise<GeneratedCodeRecord[]>;
  searchComponents(queryText: string): Promise<ComponentSearchResult[]>;
}
