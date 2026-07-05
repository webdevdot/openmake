import type { File, PrismaClient } from '../../generated/client/index.js';

export interface CreateFileInput {
  projectId: string;
  name: string;
  thumbnailUrl?: string;
}

export interface UpdateFileInput {
  name?: string;
  thumbnailUrl?: string | null;
}

export class FileRepo {
  constructor(private readonly prisma: PrismaClient) {}

  create(input: CreateFileInput): Promise<File> {
    return this.prisma.file.create({ data: input });
  }

  findById(id: string): Promise<File | null> {
    return this.prisma.file.findUnique({ where: { id } });
  }

  /** Lists non-deleted files for a project. */
  listByProject(projectId: string): Promise<File[]> {
    return this.prisma.file.findMany({
      where: { projectId, deletedAt: null },
      orderBy: { updatedAt: 'desc' },
    });
  }

  update(id: string, input: UpdateFileInput): Promise<File> {
    return this.prisma.file.update({ where: { id }, data: input });
  }

  softDelete(id: string): Promise<File> {
    return this.prisma.file.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  restore(id: string): Promise<File> {
    return this.prisma.file.update({ where: { id }, data: { deletedAt: null } });
  }

  /** Permanently deletes a file and its dependent rows (cascade). */
  hardDelete(id: string): Promise<File> {
    return this.prisma.file.delete({ where: { id } });
  }
}
