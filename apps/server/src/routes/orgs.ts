import { z } from 'zod';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { HttpError, parseOrThrow } from '../plugins/error-handler.js';
import { requireOrgRole } from '../plugins/auth.js';
import { normalizeEmail } from '../services/auth-service.js';

const CreateOrgSchema = z.object({ name: z.string().min(1) });
const OrgIdParamsSchema = z.object({ orgId: z.string().min(1) });
const UpdateOrgSchema = z.object({ name: z.string().min(1).optional() });
const AddMemberSchema = z.object({
  email: z.string().email(),
  role: z.enum(['OWNER', 'ADMIN', 'EDITOR', 'VIEWER']),
});
const UpdateMemberSchema = z.object({ role: z.enum(['OWNER', 'ADMIN', 'EDITOR', 'VIEWER']) });
const MemberParamsSchema = z.object({ orgId: z.string().min(1), userId: z.string().min(1) });

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 40);
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 8);
}

async function resolveOrgIdFromParams(request: FastifyRequest): Promise<string | undefined> {
  const { orgId } = parseOrThrow(OrgIdParamsSchema, request.params);
  return orgId;
}

export async function orgRoutes(app: FastifyInstance): Promise<void> {
  app.get('/orgs', { preHandler: app.authenticate }, async (request) => {
    const memberships = await app.db.prisma.orgMember.findMany({
      where: { userId: request.user!.id },
      include: { organization: true },
    });
    return {
      orgs: memberships.map((m) => ({
        id: m.organization.id,
        name: m.organization.name,
        slug: m.organization.slug,
        role: m.role,
      })),
    };
  });

  app.post('/orgs', { preHandler: app.authenticate }, async (request, reply) => {
    const body = parseOrThrow(CreateOrgSchema, request.body);
    const org = await app.db.orgs.create({
      name: body.name,
      slug: `${slugify(body.name) || 'org'}-${randomSuffix()}`,
      ownerId: request.user!.id,
    });
    reply.status(201);
    return { org };
  });

  app.get(
    '/orgs/:orgId',
    { preHandler: [app.authenticate, requireOrgRole('VIEWER', resolveOrgIdFromParams)] },
    async (request) => {
      const org = await app.db.orgs.findById(request.orgId!);
      return { org };
    },
  );

  app.patch(
    '/orgs/:orgId',
    { preHandler: [app.authenticate, requireOrgRole('ADMIN', resolveOrgIdFromParams)] },
    async (request) => {
      const body = parseOrThrow(UpdateOrgSchema, request.body);
      const org = await app.db.prisma.organization.update({
        where: { id: request.orgId! },
        data: { name: body.name },
      });
      return { org };
    },
  );

  app.delete(
    '/orgs/:orgId',
    { preHandler: [app.authenticate, requireOrgRole('OWNER', resolveOrgIdFromParams)] },
    async (request, reply) => {
      await app.db.prisma.organization.delete({ where: { id: request.orgId! } });
      reply.status(204);
    },
  );

  app.get(
    '/orgs/:orgId/members',
    { preHandler: [app.authenticate, requireOrgRole('VIEWER', resolveOrgIdFromParams)] },
    async (request) => {
      const members = await app.db.orgs.listMembers(request.orgId!);
      return { members };
    },
  );

  app.post(
    '/orgs/:orgId/members',
    { preHandler: [app.authenticate, requireOrgRole('ADMIN', resolveOrgIdFromParams)] },
    async (request, reply) => {
      const body = parseOrThrow(AddMemberSchema, request.body);
      // Only an existing OWNER may grant the OWNER role (privilege-escalation guard).
      if (body.role === 'OWNER') {
        const actorIsOwner = await app.db.orgs.hasAtLeastRole(
          request.orgId!,
          request.user!.id,
          'OWNER',
        );
        if (!actorIsOwner) {
          throw new HttpError(403, 'FORBIDDEN', 'Only an owner can grant the owner role');
        }
      }
      const email = normalizeEmail(body.email);
      const user = await app.db.users.findByEmail(email);
      if (!user) {
        throw new HttpError(404, 'NOT_FOUND', 'No user found with that email');
      }
      const member = await app.db.orgs.addMember(request.orgId!, user.id, body.role);
      reply.status(201);
      return { member };
    },
  );

  app.patch(
    '/orgs/:orgId/members/:userId',
    { preHandler: [app.authenticate, requireOrgRole('ADMIN', resolveOrgIdFromParams)] },
    async (request) => {
      const { userId } = parseOrThrow(MemberParamsSchema, request.params);
      const body = parseOrThrow(UpdateMemberSchema, request.body);

      // Only an existing OWNER may promote someone to OWNER (privilege-escalation guard).
      if (body.role === 'OWNER') {
        const actorIsOwner = await app.db.orgs.hasAtLeastRole(
          request.orgId!,
          request.user!.id,
          'OWNER',
        );
        if (!actorIsOwner) {
          throw new HttpError(403, 'FORBIDDEN', 'Only an owner can grant the owner role');
        }
      }

      if (body.role !== 'OWNER') {
        const target = await app.db.orgs.getMember(request.orgId!, userId);
        if (target?.role === 'OWNER') {
          const members = await app.db.orgs.listMembers(request.orgId!);
          const ownerCount = members.filter((m) => m.role === 'OWNER').length;
          if (ownerCount <= 1) {
            throw new HttpError(400, 'LAST_OWNER', 'Cannot demote the last remaining owner');
          }
        }
      }

      const member = await app.db.orgs.updateMemberRole(request.orgId!, userId, body.role);
      return { member };
    },
  );

  app.delete(
    '/orgs/:orgId/members/:userId',
    { preHandler: [app.authenticate, requireOrgRole('VIEWER', resolveOrgIdFromParams)] },
    async (request, reply) => {
      const { userId } = parseOrThrow(MemberParamsSchema, request.params);
      const isSelf = userId === request.user!.id;
      if (!isSelf) {
        const hasAdmin = await app.db.orgs.hasAtLeastRole(
          request.orgId!,
          request.user!.id,
          'ADMIN',
        );
        if (!hasAdmin) {
          throw new HttpError(403, 'FORBIDDEN', 'Insufficient role for this action');
        }
      }

      const target = await app.db.orgs.getMember(request.orgId!, userId);
      if (target?.role === 'OWNER') {
        const members = await app.db.orgs.listMembers(request.orgId!);
        const ownerCount = members.filter((m) => m.role === 'OWNER').length;
        if (ownerCount <= 1) {
          throw new HttpError(400, 'LAST_OWNER', 'Cannot remove the last remaining owner');
        }
      }

      await app.db.orgs.removeMember(request.orgId!, userId);
      reply.status(204);
    },
  );
}
