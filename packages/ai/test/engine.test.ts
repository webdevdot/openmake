import { describe, expect, it, vi } from 'vitest';
import { AiEngine, type AgentSpec, type WorkflowSpec } from '../src/engine.js';
import type { GenerateOptions, ModelConfig, ModelPort } from '../src/model.js';

const MODEL_CONFIG: ModelConfig = { provider: 'OPENAI', model: 'gpt-test' };

function makeAgent(id: string, overrides: Partial<AgentSpec> = {}): AgentSpec {
  return {
    id,
    name: id,
    model: MODEL_CONFIG,
    skills: [{ id: `${id}-skill`, name: `${id} skill`, systemPrompt: `${id} system prompt` }],
    ...overrides,
  };
}

function makeMockPort(handler: (opts: GenerateOptions) => string): ModelPort {
  return {
    generateText: vi.fn(async (opts: GenerateOptions) => ({ text: handler(opts) })),
    generateObject: vi.fn(async () => {
      throw new Error('not used in these tests');
    }),
  };
}

describe('AiEngine.runAgent', () => {
  it('passes the assembled system and prompt to the resolved ModelPort', async () => {
    let capturedSystem: string | undefined;
    let capturedPrompt: string | undefined;
    const port = makeMockPort((opts) => {
      capturedSystem = opts.system;
      capturedPrompt = opts.prompt;
      return 'the output';
    });
    const resolvePort = vi.fn(() => port);
    const engine = new AiEngine(resolvePort);

    const agent = makeAgent('designer');
    const result = await engine.runAgent(agent, { userRequest: 'Design a card' });

    expect(resolvePort).toHaveBeenCalledWith(MODEL_CONFIG);
    expect(capturedSystem).toContain('designer system prompt');
    expect(capturedPrompt).toContain('Design a card');
    expect(result.text).toBe('the output');
  });

  it('appends remaining skills system prompts after the primary skill', async () => {
    let capturedSystem = '';
    const port = makeMockPort((opts) => {
      capturedSystem = opts.system ?? '';
      return 'ok';
    });
    const engine = new AiEngine(() => port);

    const agent = makeAgent('multi', {
      skills: [
        { id: 's1', name: 's1', systemPrompt: 'FIRST' },
        { id: 's2', name: 's2', systemPrompt: 'SECOND' },
      ],
    });
    await engine.runAgent(agent, { userRequest: 'req' });

    expect(capturedSystem.indexOf('FIRST')).toBeLessThan(capturedSystem.indexOf('SECOND'));
  });

  it('forwards agent config temperature and maxOutputTokens', async () => {
    let captured: GenerateOptions | undefined;
    const port = makeMockPort((opts) => {
      captured = opts;
      return 'ok';
    });
    const engine = new AiEngine(() => port);
    const agent = makeAgent('tuned', { config: { temperature: 0.2, maxOutputTokens: 500 } });

    await engine.runAgent(agent, { userRequest: 'req' });

    expect(captured?.temperature).toBe(0.2);
    expect(captured?.maxOutputTokens).toBe(500);
  });
});

describe('AiEngine.runWorkflow', () => {
  it('chains step outputs: each step sees the previous output labeled, and returns final = last output', async () => {
    const port = makeMockPort((opts) => `${opts.prompt}::processed`);
    const engine = new AiEngine(() => port);

    const workflow: WorkflowSpec = {
      id: 'wf',
      name: 'wf',
      steps: [
        { agent: makeAgent('step1') },
        { agent: makeAgent('step2'), instructions: 'refine it' },
      ],
    };

    const result = await engine.runWorkflow(workflow, { userRequest: 'Build a login form' });

    expect(result.steps).toHaveLength(2);
    expect(result.steps[0]!.agentId).toBe('step1');
    expect(result.steps[1]!.agentId).toBe('step2');
    expect(result.steps[1]!.output).toContain('Previous agent output:');
    expect(result.steps[1]!.output).toContain(result.steps[0]!.output.split('::')[0]);
    expect(result.steps[1]!.output).toContain('refine it');
    expect(result.final).toBe(result.steps[1]!.output);
  });

  it('fires onStepStart and onStepFinish callbacks in order', async () => {
    const port = makeMockPort(() => 'out');
    const engine = new AiEngine(() => port);
    const calls: string[] = [];

    const workflow: WorkflowSpec = {
      id: 'wf',
      name: 'wf',
      steps: [{ agent: makeAgent('a') }, { agent: makeAgent('b') }],
    };

    await engine.runWorkflow(
      workflow,
      { userRequest: 'req' },
      {
        onStepStart: (i, agent) => calls.push(`start:${i}:${agent.id}`),
        onStepFinish: (i, output) => calls.push(`finish:${i}:${output}`),
      },
    );

    expect(calls).toEqual(['start:0:a', 'finish:0:out', 'start:1:b', 'finish:1:out']);
  });

  it('returns an empty final for a workflow with no steps', async () => {
    const port = makeMockPort(() => 'unused');
    const engine = new AiEngine(() => port);
    const workflow: WorkflowSpec = { id: 'empty', name: 'empty', steps: [] };

    const result = await engine.runWorkflow(workflow, { userRequest: 'req' });

    expect(result.steps).toEqual([]);
    expect(result.final).toBe('');
  });
});
