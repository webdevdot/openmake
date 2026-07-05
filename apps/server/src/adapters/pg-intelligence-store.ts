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
    const agents = await this.db.agents.listForOrg(this.orgId);
    const withSkills = await Promise.all(
      agents.map(async (agent) => {
        const full = await this.db.agents.findById(agent.id);
        return full ?? { ...agent, skills: [] };
      }),
    );
    return withSkills;
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

  async getComponent(fileId: string, nodeId: string): Promise<ComponentRecord | null> {
    const component = await this.db.components.findByNode(fileId, nodeId);
    if (!component) return null;
    return { id: component.id, name: component.name, metadata: component.metadata };
  }

  async upsertComponent(
    fileId: string,
    nodeId: string,
    data: { name: string; description?: string; metadata?: unknown },
  ): Promise<{ id: string }> {
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
    await this.db.components.createAttachment({
      componentId,
      skillId: att.skillId,
      agentId: att.agentId,
      workflowId: att.workflowId,
      prompts: att.prompts === undefined ? undefined : asInputJson(att.prompts),
    });
  }

  async listAttachments(componentId: string): Promise<IntelligenceAttachment[]> {
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
