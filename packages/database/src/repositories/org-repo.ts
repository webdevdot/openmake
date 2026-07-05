import type { OrgMember, OrgRole, Organization, PrismaClient } from '../../generated/client/index.js';

export interface CreateOrgInput {
  name: string;
  slug: string;
  ownerId: string;
}

/** Role hierarchy, highest privilege first. Used for `hasAtLeastRole` checks. */
const ROLE_RANK: Record<OrgRole, number> = {
  OWNER: 3,
  ADMIN: 2,
  EDITOR: 1,
  VIEWER: 0,
};

export class OrgRepo {
  constructor(private readonly prisma: PrismaClient) {}

  /** Creates an organization and its owner membership in one transaction. */
  async create(input: CreateOrgInput): Promise<Organization> {
    return this.prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: { name: input.name, slug: input.slug },
      });
      await tx.orgMember.create({
        data: { orgId: org.id, userId: input.ownerId, role: 'OWNER' },
      });
      return org;
    });
  }

  findById(id: string): Promise<Organization | null> {
    return this.prisma.organization.findUnique({ where: { id } });
  }

  findBySlug(slug: string): Promise<Organization | null> {
    return this.prisma.organization.findUnique({ where: { slug } });
  }

  addMember(orgId: string, userId: string, role: OrgRole): Promise<OrgMember> {
    return this.prisma.orgMember.create({ data: { orgId, userId, role } });
  }

  updateMemberRole(orgId: string, userId: string, role: OrgRole): Promise<OrgMember> {
    return this.prisma.orgMember.update({
      where: { orgId_userId: { orgId, userId } },
      data: { role },
    });
  }

  removeMember(orgId: string, userId: string): Promise<OrgMember> {
    return this.prisma.orgMember.delete({
      where: { orgId_userId: { orgId, userId } },
    });
  }

  getMember(orgId: string, userId: string): Promise<OrgMember | null> {
    return this.prisma.orgMember.findUnique({
      where: { orgId_userId: { orgId, userId } },
    });
  }

  listMembers(orgId: string): Promise<OrgMember[]> {
    return this.prisma.orgMember.findMany({ where: { orgId } });
  }

  /** True if the user is a member of the org with at least the given role. */
  async hasAtLeastRole(orgId: string, userId: string, minRole: OrgRole): Promise<boolean> {
    const member = await this.getMember(orgId, userId);
    if (!member) return false;
    return ROLE_RANK[member.role] >= ROLE_RANK[minRole];
  }
}
