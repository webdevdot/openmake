import type { PrismaClient, Project } from '../../generated/client/index.js';

export interface CreateProjectInput {
  orgId: string;
  name: string;
  description?: string;
}

export interface UpdateProjectInput {
  name?: string;
  description?: string | null;
}

export class ProjectRepo {
  constructor(private readonly prisma: PrismaClient) {}

  create(input: CreateProjectInput): Promise<Project> {
    return this.prisma.project.create({ data: input });
  }

  findById(id: string): Promise<Project | null> {
    return this.prisma.project.findUnique({ where: { id } });
  }

  listByOrg(orgId: string): Promise<Project[]> {
    return this.prisma.project.findMany({
      where: { orgId },
      orderBy: { createdAt: 'desc' },
    });
  }

  update(id: string, input: UpdateProjectInput): Promise<Project> {
    return this.prisma.project.update({ where: { id }, data: input });
  }

  delete(id: string): Promise<Project> {
    return this.prisma.project.delete({ where: { id } });
  }
}
