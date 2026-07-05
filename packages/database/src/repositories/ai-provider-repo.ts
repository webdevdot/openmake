import type { AiProvider, AiProviderKind, PrismaClient } from '../../generated/client/index.js';

export interface UpsertAiProviderInput {
  orgId: string;
  provider: AiProviderKind;
  encryptedKey: string;
  baseUrl?: string;
  enabled?: boolean;
}

export class AiProviderRepo {
  constructor(private readonly prisma: PrismaClient) {}

  upsert(input: UpsertAiProviderInput): Promise<AiProvider> {
    const { orgId, provider, ...rest } = input;
    return this.prisma.aiProvider.upsert({
      where: { orgId_provider: { orgId, provider } },
      create: { orgId, provider, ...rest },
      update: rest,
    });
  }

  findForOrg(orgId: string, provider: AiProviderKind): Promise<AiProvider | null> {
    return this.prisma.aiProvider.findUnique({ where: { orgId_provider: { orgId, provider } } });
  }

  listForOrg(orgId: string): Promise<AiProvider[]> {
    return this.prisma.aiProvider.findMany({ where: { orgId } });
  }

  setEnabled(orgId: string, provider: AiProviderKind, enabled: boolean): Promise<AiProvider> {
    return this.prisma.aiProvider.update({
      where: { orgId_provider: { orgId, provider } },
      data: { enabled },
    });
  }

  delete(orgId: string, provider: AiProviderKind): Promise<AiProvider> {
    return this.prisma.aiProvider.delete({ where: { orgId_provider: { orgId, provider } } });
  }
}
