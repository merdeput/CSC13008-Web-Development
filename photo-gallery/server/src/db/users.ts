import type { PrismaClient } from "../generated/prisma/client.js";

export type SafeUser = { id: string; username: string; displayName: string | null; bio: string | null; avatarUrl: string | null };

export class UserRepository {
  constructor(private readonly prisma: PrismaClient) {}

  findForLogin(usernameNormalized: string) {
    return this.prisma.user.findUnique({ where: { usernameNormalized }, select: { id: true, username: true, passwordHash: true, isSystem: true, displayName: true, bio: true, avatarUrl: true } });
  }

  createUser(input: { username: string; usernameNormalized: string; passwordHash: string }) {
    return this.prisma.user.create({ data: input, select: { id: true, username: true, displayName: true, bio: true, avatarUrl: true } });
  }

  deleteUser(userId: string) { return this.prisma.user.deleteMany({ where: { id: userId } }); }

  createSession(input: { id: string; userId: string; tokenHash: string; csrfToken: string; expiresAt: Date }) {
    return this.prisma.userSession.create({ data: input });
  }

  async findSession(tokenHash: string) {
    const session = await this.prisma.userSession.findUnique({
      where: { tokenHash },
      include: { user: { select: { id: true, username: true, displayName: true, bio: true, avatarUrl: true, isSystem: true } } },
    });
    if (!session) return null;
    if (session.expiresAt <= new Date() || session.user.isSystem) {
      await this.prisma.userSession.deleteMany({ where: { id: session.id } });
      return null;
    }
    return session;
  }

  deleteSession(sessionId: string) {
    return this.prisma.userSession.deleteMany({ where: { id: sessionId } });
  }

  publicProfile(usernameNormalized: string) {
    return this.prisma.user.findFirst({
      where: { usernameNormalized, isSystem: false },
      select: {
        id: true, username: true, displayName: true, bio: true, avatarUrl: true, createdAt: true,
        _count: { select: { photos: { where: { status: "ready" } } } },
      },
    });
  }

  updateProfile(userId: string, input: { displayName?: string | null; bio?: string | null; avatarUrl?: string | null }) {
    return this.prisma.user.update({
      where: { id: userId },
      data: input,
      select: { id: true, username: true, displayName: true, bio: true, avatarUrl: true },
    });
  }
}
