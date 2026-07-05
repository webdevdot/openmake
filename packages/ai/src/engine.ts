import type { DesignContext } from '@openmake/shared';
import { assemblePrompt } from './prompt.js';
import { resolveModel, type ModelConfig, type ModelPort } from './model.js';

export interface SkillSpec {
  id: string;
  name: string;
  description?: string;
  systemPrompt: string;
  /** JSON-schema-ish description of the expected output; informational only for now. */
  outputSchema?: Record<string, unknown>;
}

export interface AgentSpec {
  id: string;
  name: string;
  model: ModelConfig;
  skills: SkillSpec[];
  config?: { temperature?: number; maxOutputTokens?: number };
}

export interface WorkflowStep {
  agent: AgentSpec;
  instructions?: string;
}

export interface WorkflowSpec {
  id: string;
  name: string;
  steps: WorkflowStep[];
}

export interface RunInput {
  userRequest: string;
  designContext?: DesignContext;
  projectContext?: string;
  framework?: string;
}

export interface RunCallbacks {
  onStepStart?(index: number, agent: AgentSpec): void;
  onStepFinish?(index: number, output: string): void;
}

export interface WorkflowResult {
  steps: Array<{ agentId: string; output: string }>;
  final: string;
}

const PREVIOUS_OUTPUT_LABEL = 'Previous agent output:';

/**
 * Executes Skills, Agents, and Workflows: assembles the layered prompt for
 * an agent's skills and drives sequential multi-agent pipelines (e.g.
 * designer → a11y → engineer → reviewer → docs).
 */
export class AiEngine {
  constructor(private readonly resolvePort: (config: ModelConfig) => ModelPort = resolveModel) {}

  async runAgent(agent: AgentSpec, input: RunInput): Promise<{ text: string }> {
    const [primarySkill, ...restSkills] = agent.skills;

    const { system, prompt } = assemblePrompt({
      skill: primarySkill,
      projectContext: input.projectContext,
      designContext: input.designContext,
      framework: input.framework,
      userRequest: input.userRequest,
    });

    const fullSystem = restSkills.length > 0
      ? [system, ...restSkills.map((skill) => skill.systemPrompt)].join('\n\n')
      : system;

    const port = this.resolvePort(agent.model);
    return port.generateText({
      system: fullSystem,
      prompt,
      temperature: agent.config?.temperature,
      maxOutputTokens: agent.config?.maxOutputTokens,
    });
  }

  async runWorkflow(
    workflow: WorkflowSpec,
    input: RunInput,
    cb?: RunCallbacks,
  ): Promise<WorkflowResult> {
    const steps: Array<{ agentId: string; output: string }> = [];
    let previousOutput: string | undefined;

    for (let i = 0; i < workflow.steps.length; i++) {
      const step = workflow.steps[i];
      if (!step) continue;

      cb?.onStepStart?.(i, step.agent);

      const userRequest = [
        input.userRequest,
        previousOutput !== undefined ? `${PREVIOUS_OUTPUT_LABEL}\n${previousOutput}` : undefined,
        step.instructions,
      ]
        .filter((part): part is string => part !== undefined)
        .join('\n\n');

      const { text } = await this.runAgent(step.agent, { ...input, userRequest });

      steps.push({ agentId: step.agent.id, output: text });
      previousOutput = text;
      cb?.onStepFinish?.(i, text);
    }

    return { steps, final: previousOutput ?? '' };
  }
}
