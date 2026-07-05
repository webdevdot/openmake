import type { PrismaClient, User, UserRole } from '../../generated/client/client.js';

export interface CreateUserInput {
  email: string;
  passwordHash: string;
  name: string;
  avatarUrl?: string;
  role?: UserRole;
}

export interface UpdateUserInput {
  name?: string;
  avatarUrl?: string | null;
  passwordHash?: string;
  role?: UserRole;
}

export class UserRepo {
  constructor(private readonly prisma: PrismaClient) {}

  create(input: CreateUserInput): Promise<User> {
    return this.prisma.user.create({ data: input });
  }

  findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  update(id: string, input: UpdateUserInput): Promise<User> {
    return this.prisma.user.update({ where: { id }, data: input });
  }

  delete(id: string): Promise<User> {
    return this.prisma.user.delete({ where: { id } });
  }

  async createRefreshToken(input: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<{ id: string }> {
    return this.prisma.refreshToken.create({
      data: input,
      select: { id: true },
    });
  }

  findRefreshTokenByHash(tokenHash: string) {
    return this.prisma.refreshToken.findUnique({ where: { tokenHash } });
  }

  revokeRefreshToken(id: string): Promise<{ id: string }> {
    return this.prisma.refreshToken.update({
      where: { id },
      data: { revokedAt: new Date() },
      select: { id: true },
    });
  }
}
