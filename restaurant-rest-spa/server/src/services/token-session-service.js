const crypto = require('node:crypto');
const { revokeUserSessions } = require('../../../../shared/auth/auth-service');

const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function makeRefreshToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function hashRefreshToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function createTokenSessionService(db) {
  async function revokeFamily(tx, sessionId, reason, now = new Date()) {
    await tx.authSession.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: now, revokeReason: reason }
    });
  }

  return {
    async createSession(userId) {
      const now = new Date();
      const sessionId = crypto.randomUUID();
      const tokenId = crypto.randomUUID();
      const expiresAt = new Date(now.getTime() + REFRESH_TTL_MS);
      const rawToken = makeRefreshToken();
      await db.$transaction(async (tx) => {
        await tx.authSession.create({ data: { id: sessionId, userId, createdAt: now, expiresAt } });
        await tx.refreshToken.create({
          data: { id: tokenId, sessionId, tokenHash: hashRefreshToken(rawToken), issuedAt: now, expiresAt }
        });
      });
      return { sessionId, expiresAt, refreshToken: rawToken };
    },

    async rotate(rawToken) {
      if (typeof rawToken !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(rawToken)) return { status: 'invalid' };
      const now = new Date();
      const nextRawToken = makeRefreshToken();
      const nextTokenId = crypto.randomUUID();
      const tokenHash = hashRefreshToken(rawToken);

      return db.$transaction(async (tx) => {
        const current = await tx.refreshToken.findUnique({
          where: { tokenHash },
          include: { session: { include: { user: true } } }
        });
        if (!current) return { status: 'invalid' };
        const session = current.session;
        const user = session && session.user;
        if (!session) return { status: 'invalid' };

        if (current.usedAt) {
          if (!session.revokedAt && session.expiresAt > now) {
            await revokeFamily(tx, session.id, 'REFRESH_REUSE', now);
            return { status: 'reuse' };
          }
          return { status: 'invalid' };
        }
        if (session.revokedAt || session.expiresAt <= now || current.expiresAt <= now) {
          if (!session.revokedAt && session.expiresAt <= now) await revokeFamily(tx, session.id, 'EXPIRED', now);
          return { status: 'invalid' };
        }
        if (!user || user.status !== 'ACTIVE' || !user.emailVerifiedAt) {
          if (user) await revokeUserSessions(tx, user.id, now, 'ACCOUNT_DEACTIVATED');
          else await revokeFamily(tx, session.id, 'ACCOUNT_DEACTIVATED', now);
          return { status: 'invalid' };
        }

        const sessionTouch = await tx.authSession.updateMany({
          where: { id: session.id, revokedAt: null, expiresAt: { gt: now } },
          data: { lastUsedAt: now }
        });
        if (!sessionTouch.count) return { status: 'invalid' };

        const consumed = await tx.refreshToken.updateMany({
          where: { id: current.id, usedAt: null, expiresAt: { gt: now } },
          data: { usedAt: now, replacedById: nextTokenId }
        });
        if (!consumed.count) {
          const latest = await tx.refreshToken.findUnique({ where: { id: current.id } });
          if (latest && latest.usedAt) {
            await revokeFamily(tx, session.id, 'REFRESH_REUSE', now);
            return { status: 'reuse' };
          }
          return { status: 'invalid' };
        }

        await tx.refreshToken.create({
          data: {
            id: nextTokenId,
            sessionId: session.id,
            tokenHash: hashRefreshToken(nextRawToken),
            parentId: current.id,
            issuedAt: now,
            expiresAt: session.expiresAt
          }
        });
        return {
          status: 'rotated',
          sessionId: session.id,
          expiresAt: session.expiresAt,
          refreshToken: nextRawToken,
          user: { id: user.id, email: user.email, role: user.role }
        };
      });
    },

    async findActiveSession(sessionId) {
      const now = new Date();
      const session = await db.authSession.findUnique({
        where: { id: sessionId },
        include: { user: true }
      });
      if (!session || session.revokedAt || session.expiresAt <= now) return null;
      const user = session.user;
      if (!user || user.status !== 'ACTIVE' || !user.emailVerifiedAt) {
        if (user) await db.$transaction((tx) => revokeUserSessions(tx, user.id, now, 'ACCOUNT_DEACTIVATED'));
        else await db.$transaction((tx) => revokeFamily(tx, session.id, 'ACCOUNT_DEACTIVATED', now));
        return null;
      }
      return { sessionId: session.id, user: { id: user.id, email: user.email, role: user.role } };
    },

    async findSessionForRefreshToken(rawToken) {
      if (typeof rawToken !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(rawToken)) return null;
      const token = await db.refreshToken.findUnique({
        where: { tokenHash: hashRefreshToken(rawToken) },
        select: { sessionId: true }
      });
      return token ? token.sessionId : null;
    },

    async revokeSession(sessionId, reason = 'LOGOUT') {
      if (typeof sessionId !== 'string') return false;
      const now = new Date();
      const result = await db.authSession.updateMany({
        where: { id: sessionId, revokedAt: null },
        data: { revokedAt: now, revokeReason: reason }
      });
      return result.count > 0;
    },

    async revokeAllForUser(userId, reason = 'ACCOUNT_DEACTIVATED') {
      if (typeof userId !== 'string') return false;
      await db.$transaction((tx) => revokeUserSessions(tx, userId, new Date(), reason));
      return true;
    },

    async pruneExpired() {
      const retentionCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const removed = await db.authSession.deleteMany({
        where: {
          OR: [
            { expiresAt: { lte: retentionCutoff } },
            { revokedAt: { lte: retentionCutoff } }
          ]
        }
      });
      return removed.count;
    }
  };
}

module.exports = { REFRESH_TTL_MS, hashRefreshToken, createTokenSessionService };
