import type { ApiKey, PrismaClient } from '../../generated/client/client.js';

export interface CreateApiKeyInput {
  orgId: string;
  name: string;
  /** sha256 hex digest of the secret — the plaintext key is never stored. */
  keyHash: string;
  scopes: string[];
  expiresAt?: Date;
}

export class ApiKeyRepo {
  constructor(private readonly prisma: PrismaClient) {}

  create(input: CreateApiKeyInput): Promise<ApiKey> {
    return this.prisma.apiKey.create({ data: input });
  }

  findById(id: string): Promise<ApiKey | null> {
    return this.prisma.apiKey.findUnique({ where: { id } });
  }

  listForOrg(orgId: string): Promise<ApiKey[]> {
    return this.prisma.apiKey.findMany({ where: { orgId }, orderBy: { createdAt: 'desc' } });
  }

  /** Looks up an API key by hash, returning it only if not revoked or expired. */
  async findActiveByHash(keyHash: string): Promise<ApiKey | null> {
    const key = await this.prisma.apiKey.findUnique({ where: { keyHash } });
    if (!key) return null;
    if (key.revokedAt) return null;
    if (key.expiresAt && key.expiresAt.getTime() <= Date.now()) return null;
    return key;
  }

  touchLastUsed(id: string): Promise<ApiKey> {
    return this.prisma.apiKey.update({ where: { id }, data: { lastUsedAt: new Date() } });
  }

  revoke(id: string): Promise<ApiKey> {
    return this.prisma.apiKey.update({ where: { id }, data: { revokedAt: new Date() } });
  }
}
