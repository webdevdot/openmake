import type { Database, Prisma } from '@openmake/database';
import type { AgentSpec, SkillSpec, WorkflowSpec, WorkflowStep } from '@openmake/ai';
import type {
  ComponentRecord,
  ComponentSearchResult,
  GeneratedCodeRecord,
  IntelligenceAttachment,
  IntelligenceStore,
} from '@openmake/mcp';
import type { Agent, CodeFramework, Skill } from '@openmake/database';

/** Casts an arbitrary JS value to Prisma's InputJsonValue for writes; callers are trusted to pass JSON-safe data. */
function asInputJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function toSkillSpec(skill: Skill): SkillSpec {
  return {
    id: skill.id,
    name: skill.name,
    description: skill.description ?? undefined,
    systemPrompt: skill.systemPrompt,
    outputSchema: (skill.outputSchema as Record<string, unknown> | null) ?? undefined,
  };
}

type AgentWithSkills = Agent & { skills: Skill[] };

function toAgentSpec(agent: AgentWithSkills): AgentSpec {
  return {
    id: agent.id,
    name: agent.name,
    model: { provider: agent.provider, model: agent.model },
    skills: agent.skills.map(toSkillSpec),
    config: (agent.config as { temperature?: number; maxOutputTokens?: number } | null) ?? undefined,
  };
}

interface WorkflowDefinitionStep {
  agentId: string;
  instructions?: string;
}

/** IntelligenceStore scoped to a single org, for MCP. */
export class PgIntelligenceStore implements IntelligenceStore {
  constructor(
    private readonly db: Database,
    private readonly orgId: string,
  ) {}

  async listSkills(): Promise<SkillSpec[]> {
    const skills = await this.db.skills.listForOrg(this.orgId);
    return skills.map(toSkillSpec);
  }

  private async listAgentsWithSkills(): Promise<AgentWithSkills[]> {
    // Single query with skills included — avoids the per-agent N+1.
    return this.db.agents.listForOrgWithSkills(this.orgId);
  }

  async listAgents(): Promise<AgentSpec[]> {
    const agents = await this.listAgentsWithSkills();
    return agents.map(toAgentSpec);
  }

  async listWorkflows(): Promise<WorkflowSpec[]> {
    const [workflows, agents] = await Promise.all([
      this.db.workflows.listForOrg(this.orgId),
      this.listAgentsWithSkills(),
    ]);
    const agentsById = new Map(agents.map((agent) => [agent.id, toAgentSpec(agent)]));

    return workflows.map((workflow) => {
      const definition = (workflow.definition as WorkflowDefinitionStep[] | null) ?? [];
      const steps: WorkflowStep[] = [];
      for (const step of definition) {
        const agent = agentsById.get(step.agentId);
        if (!agent) continue;
        steps.push({ agent, instructions: step.instructions });
      }
      return { id: workflow.id, name: workflow.name, steps };
    });
  }

  /** Rejects a file id whose project is not owned by this store's org (IDOR guard). */
  private async assertFileOwned(fileId: string): Promise<void> {
    const file = await this.db.prisma.file.findFirst({
      where: { id: fileId, deletedAt: null, project: { orgId: this.orgId } },
      select: { id: true },
    });
    if (!file) throw new Error(`File "${fileId}" not found`);
  }

  /** Rejects a component id whose file's project is not owned by this store's org (IDOR guard). */
  private async assertComponentOwned(componentId: string): Promise<void> {
    const component = await this.db.prisma.component.findFirst({
      where: { id: componentId, file: { project: { orgId: this.orgId } } },
      select: { id: true },
    });
    if (!component) throw new Error(`Component "${componentId}" not found`);
  }

  /** Rejects skill/agent/workflow ids not owned by this org (built-in skills are allowed). */
  private async assertIntelligenceOwned(att: IntelligenceAttachment): Promise<void> {
    if (att.skillId) {
      const skill = await this.db.prisma.skill.findFirst({
        where: { id: att.skillId, OR: [{ orgId: this.orgId }, { builtIn: true }] },
        select: { id: true },
      });
      if (!skill) throw new Error(`Skill "${att.skillId}" not found`);
    }
    if (att.agentId) {
      const agent = await this.db.prisma.agent.findFirst({
        where: { id: att.agentId, orgId: this.orgId },
        select: { id: true },
      });
      if (!agent) throw new Error(`Agent "${att.agentId}" not found`);
    }
    if (att.workflowId) {
      const workflow = await this.db.prisma.workflow.findFirst({
        where: { id: att.workflowId, orgId: this.orgId },
        select: { id: true },
      });
      if (!workflow) throw new Error(`Workflow "${att.workflowId}" not found`);
    }
  }

  async getComponent(fileId: string, nodeId: string): Promise<ComponentRecord | null> {
    await this.assertFileOwned(fileId);
    const component = await this.db.components.findByNode(fileId, nodeId);
    if (!component) return null;
    return { id: component.id, name: component.name, metadata: component.metadata };
  }

  async upsertComponent(
    fileId: string,
    nodeId: string,
    data: { name: string; description?: string; metadata?: unknown },
  ): Promise<{ id: string }> {
    await this.assertFileOwned(fileId);
    const component = await this.db.components.upsertByNode({
      fileId,
      nodeId,
      name: data.name,
      description: data.description,
      metadata: asInputJson(data.metadata ?? {}),
    });
    return { id: component.id };
  }

  async attachIntelligence(componentId: string, att: IntelligenceAttachment): Promise<void> {
    await this.assertComponentOwned(componentId);
    await this.assertIntelligenceOwned(att);
    await this.db.components.createAttachment({
      componentId,
      skillId: att.skillId,
      agentId: att.agentId,
      workflowId: att.workflowId,
      prompts: att.prompts === undefined ? undefined : asInputJson(att.prompts),
    });
  }

  async listAttachments(componentId: string): Promise<IntelligenceAttachment[]> {
    await this.assertComponentOwned(componentId);
    const attachments = await this.db.components.listAttachments(componentId);
    return attachments.map((attachment) => ({
      skillId: attachment.skillId ?? undefined,
      agentId: attachment.agentId ?? undefined,
      workflowId: attachment.workflowId ?? undefined,
      prompts: attachment.prompts ?? undefined,
    }));
  }

  async saveGeneratedCode(
    componentId: string,
    framework: string,
    code: string,
  ): Promise<{ version: number }> {
    await this.assertComponentOwned(componentId);
    const { createHash } = await import('node:crypto');
    const hash = createHash('sha256').update(code).digest('hex');
    const saved = await this.db.components.saveGeneratedCode({
      componentId,
      framework: framework as CodeFramework,
      code,
      hash,
    });
    return { version: saved.version };
  }

  async getGeneratedCode(componentId: string, framework?: string): Promise<GeneratedCodeRecord[]> {
    await this.assertComponentOwned(componentId);
    const rows = await this.db.components.listGeneratedCode(
      componentId,
      framework as CodeFramework | undefined,
    );
    return rows.map((row) => ({ framework: row.framework, code: row.code, version: row.version }));
  }

  async searchComponents(queryText: string): Promise<ComponentSearchResult[]> {
    const rows = await this.db.prisma.component.findMany({
      where: {
        file: { project: { orgId: this.orgId } },
        OR: [
          { name: { contains: queryText, mode: 'insensitive' } },
          { description: { contains: queryText, mode: 'insensitive' } },
        ],
      },
      take: 20,
    });
    return rows.map((row) => ({ componentId: row.id, name: row.name, score: 1 }));
  }
}

/** Wraps an IntelligenceStore so every mutating method throws — for read-only API keys. */
export class ReadOnlyIntelligenceStore implements IntelligenceStore {
  constructor(private readonly inner: IntelligenceStore) {}

  listSkills = (): Promise<SkillSpec[]> => this.inner.listSkills();
  listAgents = (): Promise<AgentSpec[]> => this.inner.listAgents();
  listWorkflows = (): Promise<WorkflowSpec[]> => this.inner.listWorkflows();
  getComponent = (fileId: string, nodeId: string): Promise<ComponentRecord | null> =>
    this.inner.getComponent(fileId, nodeId);
  listAttachments = (componentId: string): Promise<IntelligenceAttachment[]> =>
    this.inner.listAttachments(componentId);
  getGeneratedCode = (componentId: string, framework?: string): Promise<GeneratedCodeRecord[]> =>
    this.inner.getGeneratedCode(componentId, framework);
  searchComponents = (queryText: string): Promise<ComponentSearchResult[]> =>
    this.inner.searchComponents(queryText);

  upsertComponent(): Promise<{ id: string }> {
    throw new Error('read-only API key');
  }
  attachIntelligence(): Promise<void> {
    throw new Error('read-only API key');
  }
  saveGeneratedCode(): Promise<{ version: number }> {
    throw new Error('read-only API key');
  }
}
