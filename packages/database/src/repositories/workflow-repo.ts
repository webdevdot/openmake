import type { Prisma } from '../../generated/client/index.js';
import type { PrismaClient, Workflow } from '../../generated/client/index.js';

export interface CreateWorkflowInput {
  orgId?: string;
  name: string;
  description: string;
  /** Ordered steps: `[{ agentId, instructions? }]`. */
  definition: Prisma.InputJsonValue;
}

export type UpdateWorkflowInput = Partial<Omit<CreateWorkflowInput, 'orgId'>>;

export class WorkflowRepo {
  constructor(private readonly prisma: PrismaClient) {}

  create(input: CreateWorkflowInput): Promise<Workflow> {
    return this.prisma.workflow.create({ data: input });
  }

  findById(id: string): Promise<Workflow | null> {
    return this.prisma.workflow.findUnique({ where: { id } });
  }

  listForOrg(orgId: string): Promise<Workflow[]> {
    return this.prisma.workflow.findMany({ where: { orgId }, orderBy: { createdAt: 'asc' } });
  }

  update(id: string, input: UpdateWorkflowInput): Promise<Workflow> {
    return this.prisma.workflow.update({ where: { id }, data: input });
  }

  delete(id: string): Promise<Workflow> {
    return this.prisma.workflow.delete({ where: { id } });
  }
}
