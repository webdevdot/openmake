import type { Prisma } from '../../generated/client/index.js';
import type { PrismaClient, Skill } from '../../generated/client/index.js';

export interface CreateSkillInput {
  orgId?: string;
  name: string;
  description: string;
  systemPrompt: string;
  outputSchema?: Prisma.InputJsonValue;
  examples?: Prisma.InputJsonValue;
  toolPermissions?: Prisma.InputJsonValue;
  builtIn?: boolean;
}

export type UpdateSkillInput = Partial<Omit<CreateSkillInput, 'orgId'>>;

export class SkillRepo {
  constructor(private readonly prisma: PrismaClient) {}

  create(input: CreateSkillInput): Promise<Skill> {
    return this.prisma.skill.create({ data: input });
  }

  findById(id: string): Promise<Skill | null> {
    return this.prisma.skill.findUnique({ where: { id } });
  }

  /** Lists an org's own skills plus all builtIn skills, which are readable by everyone. */
  listForOrg(orgId: string): Promise<Skill[]> {
    return this.prisma.skill.findMany({
      where: { OR: [{ orgId }, { builtIn: true }] },
      orderBy: { createdAt: 'asc' },
    });
  }

  listBuiltIn(): Promise<Skill[]> {
    return this.prisma.skill.findMany({ where: { builtIn: true } });
  }

  update(id: string, input: UpdateSkillInput): Promise<Skill> {
    return this.prisma.skill.update({ where: { id }, data: input });
  }

  delete(id: string): Promise<Skill> {
    return this.prisma.skill.delete({ where: { id } });
  }
}
