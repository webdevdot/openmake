import { z } from 'zod';
import { AiEngine, buildDesignContext, decryptSecret } from '@openmake/ai';
import type { AgentSpec, SkillSpec, WorkflowSpec } from '@openmake/ai';
import type { Skill } from '@openmake/database';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { HttpError, parseOrThrow } from '../plugins/error-handler.js';
import { requireOrgRole, resolveOrgIdFromFile } from '../plugins/auth.js';
import { loadOpenDoc } from '../services/doc-service.js';

const WorkflowIdParamsSchema = z.object({ workflowId: z.string().min(1) });
const RunWorkflowSchema = z.object({
  fileId: z.string().min(1),
  nodeId: z.string().min(1),
  request: z.string().min(1),
  framework: z.string().optional(),
});

interface WorkflowDefinitionStep {
  agentId: string;
  instructions?: string;
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

async function resolveOrgIdFromBody(request: FastifyRequest): Promise<string | undefined> {
  const body = parseOrThrow(RunWorkflowSchema, request.body);
  return resolveOrgIdFromFile(request.server, body.fileId);
}

const aiEngine = new AiEngine();

export async function aiRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/ai/workflows/:workflowId/run',
    { preHandler: [app.authenticate, requireOrgRole('EDITOR', resolveOrgIdFromBody)] },
    async (request) => {
      const { workflowId } = parseOrThrow(WorkflowIdParamsSchema, request.params);
      const body = parseOrThrow(RunWorkflowSchema, request.body);
      const orgId = request.orgId!;

      const workflow = await app.db.workflows.findById(workflowId);
      // Workflow must belong to the org resolved from the request (IDOR guard).
      if (!workflow || workflow.orgId !== orgId) {
        throw new HttpError(404, 'NOT_FOUND', 'Workflow not found');
      }

      // The target file must also belong to this org — the workflow reads its design.
      const file = await app.db.prisma.file.findFirst({
        where: { id: body.fileId, deletedAt: null, project: { orgId } },
        select: { id: true },
      });
      if (!file) throw new HttpError(404, 'NOT_FOUND', 'File not found');

      const definition = (workflow.definition as WorkflowDefinitionStep[] | null) ?? [];
      const steps: WorkflowSpec['steps'] = [];
      let lastAgentId: string | undefined;

      for (const step of definition) {
        const agent = await app.db.agents.findById(step.agentId);
        // Each agent must belong to this org — prevents spending our provider key on foreign agents.
        if (!agent || agent.orgId !== orgId) {
          throw new HttpError(404, 'NOT_FOUND', `Agent "${step.agentId}" not found`);
        }

        const providerRow = await app.db.aiProviders.findForOrg(orgId, agent.provider);
        if (!providerRow || !providerRow.enabled) {
          throw new HttpError(
            400,
            'PROVIDER_NOT_CONFIGURED',
            `AI provider "${agent.provider}" is not configured or is disabled for this org`,
          );
        }
        const apiKey = decryptSecret(providerRow.encryptedKey, app.config.masterEncryptionKey);

        const agentSpec: AgentSpec = {
          id: agent.id,
          name: agent.name,
          model: {
            provider: agent.provider,
            model: agent.model,
            apiKey,
            baseUrl: providerRow.baseUrl ?? undefined,
          },
          skills: agent.skills.map(toSkillSpec),
          config:
            (agent.config as { temperature?: number; maxOutputTokens?: number } | null) ??
            undefined,
        };

        steps.push({ agent: agentSpec, instructions: step.instructions });
        lastAgentId = agent.id;
      }

      const workflowSpec: WorkflowSpec = { id: workflow.id, name: workflow.name, steps };

      const doc = await loadOpenDoc(app.db, body.fileId);
      const designContext = buildDesignContext(doc, [body.nodeId]);

      const result = await aiEngine.runWorkflow(workflowSpec, {
        userRequest: body.request,
        designContext,
        framework: body.framework,
      });

      const conversation = await app.db.conversations.create({
        orgId,
        userId: request.user!.id,
        agentId: lastAgentId,
        title: workflow.name,
      });

      await app.db.conversations.appendMessage({
        conversationId: conversation.id,
        role: 'USER',
        content: { text: body.request },
      });
      for (const stepResult of result.steps) {
        await app.db.conversations.appendMessage({
          conversationId: conversation.id,
          role: 'ASSISTANT',
          content: { text: stepResult.output, agentId: stepResult.agentId },
        });
      }

      await app.db.audit.append({
        orgId,
        userId: request.user!.id,
        action: 'workflow.run',
        targetType: 'workflow',
        targetId: workflow.id,
      });

      return { conversationId: conversation.id, steps: result.steps, final: result.final };
    },
  );
}
