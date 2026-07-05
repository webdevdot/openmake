import type { Prisma } from '../../generated/client/index.js';
import type { AuditLog, PrismaClient } from '../../generated/client/index.js';

export interface AppendAuditInput {
  orgId?: string;
  userId?: string;
  action: string;
  targetType?: string;
  targetId?: string;
  detail?: Prisma.InputJsonValue;
}

export interface ListAuditOptions {
  limit?: number;
  before?: Date;
}

export class AuditRepo {
  constructor(private readonly prisma: PrismaClient) {}

  append(input: AppendAuditInput): Promise<AuditLog> {
    return this.prisma.auditLog.create({ data: input });
  }

  /** Lists audit entries for an org, newest first. */
  list(orgId: string, options: ListAuditOptions = {}): Promise<AuditLog[]> {
    const { limit = 50, before } = options;
    return this.prisma.auditLog.findMany({
      where: { orgId, ...(before ? { createdAt: { lt: before } } : {}) },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}
