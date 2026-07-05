import type { Prisma } from '../../generated/client/index.js';
import type { Agent, AiProviderKind, PrismaClient } from '../../generated/client/index.js';

export interface CreateAgentInput {
  orgId?: string;
  name: string;
  description: string;
  provider: AiProviderKind;
  model: string;
  config?: Prisma.InputJsonValue;
  skillIds?: string[];
}

export type UpdateAgentInput = Partial<Omit<CreateAgentInput, 'orgId' | 'skillIds'>>;

export class AgentRepo {
  constructor(private readonly prisma: PrismaClient) {}

  create(input: CreateAgentInput): Promise<Agent> {
    const { skillIds, ...data } = input;
    return this.prisma.agent.create({
      data: {
        ...data,
        ...(skillIds ? { skills: { connect: skillIds.map((id) => ({ id })) } } : {}),
      },
    });
  }

  findById(id: string) {
    return this.prisma.agent.findUnique({ where: { id }, include: { skills: true } });
  }

  listForOrg(orgId: string): Promise<Agent[]> {
    return this.prisma.agent.findMany({ where: { orgId }, orderBy: { createdAt: 'asc' } });
  }

  update(id: string, input: UpdateAgentInput): Promise<Agent> {
    return this.prisma.agent.update({ where: { id }, data: input });
  }

  setSkills(id: string, skillIds: string[]): Promise<Agent> {
    return this.prisma.agent.update({
      where: { id },
      data: { skills: { set: skillIds.map((skillId) => ({ id: skillId })) } },
    });
  }

  delete(id: string): Promise<Agent> {
    return this.prisma.agent.delete({ where: { id } });
  }
}
