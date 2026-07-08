import type { Prisma } from '../../generated/client/client.js';
import type {
  CodeFramework,
  Component,
  ComponentAttachment,
  GeneratedCode,
  PrismaClient,
} from '../../generated/client/client.js';

export interface UpsertComponentInput {
  fileId: string;
  nodeId: string;
  name: string;
  description?: string;
  metadata: Prisma.InputJsonValue;
}

export interface CreateAttachmentInput {
  componentId: string;
  skillId?: string;
  agentId?: string;
  workflowId?: string;
  prompts?: Prisma.InputJsonValue;
}

export interface SemanticSearchResult {
  componentId: string;
  distance: number;
}

export class ComponentAttachmentValidationError extends Error {
  constructor() {
    super('ComponentAttachment requires at least one of skillId, agentId, or workflowId');
    this.name = 'ComponentAttachmentValidationError';
  }
}

export class ComponentRepo {
  constructor(private readonly prisma: PrismaClient) {}

  upsertByNode(input: UpsertComponentInput): Promise<Component> {
    const { fileId, nodeId, name, description, metadata } = input;
    return this.prisma.component.upsert({
      where: { fileId_nodeId: { fileId, nodeId } },
      create: { fileId, nodeId, name, description, metadata },
      update: { name, description, metadata },
    });
  }

  findById(id: string): Promise<Component | null> {
    return this.prisma.component.findUnique({ where: { id } });
  }

  findByNode(fileId: string, nodeId: string): Promise<Component | null> {
    return this.prisma.component.findUnique({ where: { fileId_nodeId: { fileId, nodeId } } });
  }

  listByFile(fileId: string): Promise<Component[]> {
    return this.prisma.component.findMany({ where: { fileId } });
  }

  createAttachment(input: CreateAttachmentInput): Promise<ComponentAttachment> {
    if (!input.skillId && !input.agentId && !input.workflowId) {
      throw new ComponentAttachmentValidationError();
    }
    return this.prisma.componentAttachment.create({ data: input });
  }

  listAttachments(componentId: string): Promise<ComponentAttachment[]> {
    return this.prisma.componentAttachment.findMany({ where: { componentId } });
  }

  deleteAttachment(id: string): Promise<ComponentAttachment> {
    return this.prisma.componentAttachment.delete({ where: { id } });
  }

  /** Saves generated code for a component/framework pair, auto-incrementing the version. */
  async saveGeneratedCode(input: {
    componentId: string;
    framework: CodeFramework;
    code: string;
    hash: string;
  }): Promise<GeneratedCode> {
    return this.prisma.$transaction(async (tx) => {
      const last = await tx.generatedCode.findFirst({
        where: { componentId: input.componentId, framework: input.framework },
        orderBy: { version: 'desc' },
        select: { version: true },
      });
      const version = (last?.version ?? 0) + 1;
      return tx.generatedCode.create({
        data: {
          componentId: input.componentId,
          framework: input.framework,
          code: input.code,
          hash: input.hash,
          version,
        },
      });
    });
  }

  listGeneratedCode(componentId: string, framework?: CodeFramework): Promise<GeneratedCode[]> {
    return this.prisma.generatedCode.findMany({
      where: { componentId, ...(framework ? { framework } : {}) },
      orderBy: { version: 'desc' },
    });
  }

  latestGeneratedCode(
    componentId: string,
    framework: CodeFramework,
  ): Promise<GeneratedCode | null> {
    return this.prisma.generatedCode.findFirst({
      where: { componentId, framework },
      orderBy: { version: 'desc' },
    });
  }

  /**
   * Upserts a component's embedding via raw SQL, since pgvector's `vector`
   * type isn't representable through the Prisma query builder.
   */
  async upsertEmbedding(componentId: string, embedding: number[], model: string): Promise<void> {
    const vectorLiteral = `[${embedding.join(',')}]`;
    await this.prisma.$executeRaw`
      INSERT INTO component_embeddings (id, component_id, embedding, model, created_at, updated_at)
      VALUES (gen_random_uuid()::text, ${componentId}, ${vectorLiteral}::vector, ${model}, now(), now())
      ON CONFLICT (component_id)
      DO UPDATE SET embedding = ${vectorLiteral}::vector, model = ${model}, updated_at = now()
    `;
  }

  /** Cosine-distance nearest-neighbor search over component embeddings. */
  async semanticSearch(embedding: number[], limit = 10): Promise<SemanticSearchResult[]> {
    const vectorLiteral = `[${embedding.join(',')}]`;
    const rows = await this.prisma.$queryRaw<{ component_id: string; distance: number }[]>`
      SELECT component_id, embedding <=> ${vectorLiteral}::vector AS distance
      FROM component_embeddings
      WHERE embedding IS NOT NULL
      ORDER BY embedding <=> ${vectorLiteral}::vector
      LIMIT ${limit}
    `;
    return rows.map((r) => ({ componentId: r.component_id, distance: r.distance }));
  }
}
