import type { Comment, PrismaClient } from '../../generated/client/client.js';

export interface CreateCommentInput {
  fileId: string;
  nodeId?: string;
  authorId: string;
  body: string;
  /** World-space canvas pin coordinates for free-point (non-node) comments. */
  anchorX?: number;
  anchorY?: number;
  parentId?: string;
}

export class CommentRepo {
  constructor(private readonly prisma: PrismaClient) {}

  create(input: CreateCommentInput): Promise<Comment> {
    return this.prisma.comment.create({ data: input });
  }

  findById(id: string): Promise<Comment | null> {
    return this.prisma.comment.findUnique({ where: { id } });
  }

  /** Top-level comments (and their replies) for a file, oldest first. */
  listByFile(fileId: string) {
    return this.prisma.comment.findMany({
      where: { fileId, parentId: null },
      orderBy: { createdAt: 'asc' },
      include: { replies: { orderBy: { createdAt: 'asc' } } },
    });
  }

  resolve(id: string): Promise<Comment> {
    return this.prisma.comment.update({ where: { id }, data: { resolvedAt: new Date() } });
  }

  unresolve(id: string): Promise<Comment> {
    return this.prisma.comment.update({ where: { id }, data: { resolvedAt: null } });
  }

  delete(id: string): Promise<Comment> {
    return this.prisma.comment.delete({ where: { id } });
  }
}
