import { createPrismaClient } from './client.js';
import type { PrismaClient } from './client.js';
import { AgentRepo } from './repositories/agent-repo.js';
import { AiProviderRepo } from './repositories/ai-provider-repo.js';
import { ApiKeyRepo } from './repositories/api-key-repo.js';
import { AuditRepo } from './repositories/audit-repo.js';
import { CommentRepo } from './repositories/comment-repo.js';
import { ComponentRepo } from './repositories/component-repo.js';
import { ConversationRepo } from './repositories/conversation-repo.js';
import { DocRepo } from './repositories/doc-repo.js';
import { FileRepo } from './repositories/file-repo.js';
import { OrgRepo } from './repositories/org-repo.js';
import { ProjectRepo } from './repositories/project-repo.js';
import { SkillRepo } from './repositories/skill-repo.js';
import { UserRepo } from './repositories/user-repo.js';
import { WorkflowRepo } from './repositories/workflow-repo.js';

/** Wires a Prisma client to every repository behind a single facade. */
export class Database {
  readonly prisma: PrismaClient;

  readonly users: UserRepo;
  readonly orgs: OrgRepo;
  readonly projects: ProjectRepo;
  readonly files: FileRepo;
  readonly docs: DocRepo;
  readonly components: ComponentRepo;
  readonly skills: SkillRepo;
  readonly agents: AgentRepo;
  readonly workflows: WorkflowRepo;
  readonly aiProviders: AiProviderRepo;
  readonly conversations: ConversationRepo;
  readonly comments: CommentRepo;
  readonly apiKeys: ApiKeyRepo;
  readonly audit: AuditRepo;

  constructor(prisma?: PrismaClient) {
    this.prisma = prisma ?? createPrismaClient();

    this.users = new UserRepo(this.prisma);
    this.orgs = new OrgRepo(this.prisma);
    this.projects = new ProjectRepo(this.prisma);
    this.files = new FileRepo(this.prisma);
    this.docs = new DocRepo(this.prisma);
    this.components = new ComponentRepo(this.prisma);
    this.skills = new SkillRepo(this.prisma);
    this.agents = new AgentRepo(this.prisma);
    this.workflows = new WorkflowRepo(this.prisma);
    this.aiProviders = new AiProviderRepo(this.prisma);
    this.conversations = new ConversationRepo(this.prisma);
    this.comments = new CommentRepo(this.prisma);
    this.apiKeys = new ApiKeyRepo(this.prisma);
    this.audit = new AuditRepo(this.prisma);
  }

  disconnect(): Promise<void> {
    return this.prisma.$disconnect();
  }
}
