const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createAuthService, revokeUserSessions } = require('../../shared/auth/auth-service');

function createResetDb(token) {
  const user = {
    id: '537d4e6d-14d7-49d3-8de4-57a6fd737b99',
    email: 'active@example.test',
    status: 'ACTIVE',
    passwordHash: 'old-hash'
  };
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const reset = { id: crypto.randomUUID(), userId: user.id, tokenHash, expiresAt: new Date(Date.now() + 60_000), usedAt: null };
  const legacySessions = [{ sid: 'ssr-one', userId: user.id }, { sid: 'ssr-two', userId: user.id }];
  const authSessions = [
    { id: crypto.randomUUID(), userId: user.id, revokedAt: null },
    { id: crypto.randomUUID(), userId: user.id, revokedAt: null }
  ];
  const tx = {
    passwordReset: {
      async findUnique({ where }) { return where.tokenHash === reset.tokenHash ? reset : null; },
      async updateMany({ where, data }) {
        if (where.id !== reset.id || reset.usedAt || reset.expiresAt <= where.expiresAt?.gt) return { count: 0 };
        Object.assign(reset, data);
        return { count: 1 };
      }
    },
    user: {
      async findUnique({ where }) { return where.id === user.id ? user : null; },
      async update({ where, data }) { Object.assign(user, data); return user; }
    },
    session: {
      async deleteMany({ where }) {
        const before = legacySessions.length;
        for (let i = legacySessions.length - 1; i >= 0; i -= 1) {
          if (legacySessions[i].userId === where.userId) legacySessions.splice(i, 1);
        }
        return { count: before - legacySessions.length };
      }
    },
    authSession: {
      async updateMany({ where, data }) {
        let count = 0;
        for (const session of authSessions) {
          if (session.userId === where.userId && session.revokedAt === null) {
            Object.assign(session, data);
            count += 1;
          }
        }
        return { count };
      }
    }
  };
  const db = {
    passwordReset: tx.passwordReset,
    async $transaction(callback) { return callback(tx); }
  };
  return { db, user, reset, legacySessions, authSessions };
}

test('password reset consumes its token and revokes legacy and JWT session records', async () => {
  const token = crypto.randomBytes(32).toString('base64url');
  const { db, user, reset, legacySessions, authSessions } = createResetDb(token);
  const auth = createAuthService(db);
  assert.equal(await auth.completePasswordReset(token, 'A sufficiently long replacement password!4'), true);
  assert.match(user.passwordHash, /^scrypt\$/);
  assert.ok(reset.usedAt instanceof Date);
  assert.deepEqual(legacySessions, []);
  assert.ok(authSessions.every((session) => session.revokedAt instanceof Date && session.revokeReason === 'PASSWORD_RESET'));
});

test('legacy SSR Prisma client revokes SPA sessions through raw SQL when available', async () => {
  const statements = [];
  const tx = {
    session: { async deleteMany() { return { count: 0 }; } },
    async $executeRaw(strings, ...values) {
      statements.push({ sql: strings.join('?'), values });
      return 1;
    }
  };
  const userId = '537d4e6d-14d7-49d3-8de4-57a6fd737b99';
  const at = new Date();
  await revokeUserSessions(tx, userId, at, 'PASSWORD_RESET');
  assert.match(statements[0].sql, /UPDATE "AuthSession"/);
  assert.deepEqual(statements[0].values, [at, 'PASSWORD_RESET', userId]);
});

test('legacy SSR password reset tolerates the JWT table before its additive migration exists', async () => {
  const tx = {
    session: { async deleteMany() { return { count: 1 }; } },
    async $executeRaw() {
      const error = new Error('relation "AuthSession" does not exist');
      error.code = 'P2010';
      error.meta = { code: '42P01' };
      throw error;
    }
  };
  await assert.doesNotReject(() => revokeUserSessions(tx, crypto.randomUUID(), new Date(), 'PASSWORD_RESET'));
});
