import type { Prisma } from '../../generated/client/client.js';
import type {
  AiConversation,
  AiMessage,
  MessageRole,
  PrismaClient,
} from '../../generated/client/client.js';

export interface CreateConversationInput {
  orgId: string;
  userId?: string;
  agentId?: string;
  title?: string;
}

export interface AppendMessageInput {
  conversationId: string;
  role: MessageRole;
  content: Prisma.InputJsonValue;
  tokenCount?: number;
}

export class ConversationRepo {
  constructor(private readonly prisma: PrismaClient) {}

  create(input: CreateConversationInput): Promise<AiConversation> {
    return this.prisma.aiConversation.create({ data: input });
  }

  findById(id: string): Promise<AiConversation | null> {
    return this.prisma.aiConversation.findUnique({ where: { id } });
  }

  listForOrg(orgId: string): Promise<AiConversation[]> {
    return this.prisma.aiConversation.findMany({
      where: { orgId },
      orderBy: { updatedAt: 'desc' },
    });
  }

  appendMessage(input: AppendMessageInput): Promise<AiMessage> {
    return this.prisma.aiMessage.create({ data: input });
  }

  /** Full message history for a conversation, oldest first. */
  history(conversationId: string): Promise<AiMessage[]> {
    return this.prisma.aiMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
    });
  }
}
