const test = require('node:test');
const assert = require('node:assert/strict');
const { createTokenSessionService, hashRefreshToken } = require('../server/src/services/token-session-service');

function matches(record, where) {
  return Object.entries(where).every(([key, expected]) => {
    const actual = record[key] ?? null;
    if (expected && typeof expected === 'object' && !(expected instanceof Date)) {
      return Object.entries(expected).every(([operator, value]) => {
        if (operator === 'gt') return actual > value;
        if (operator === 'lt') return actual < value;
        if (operator === 'lte') return actual <= value;
        return false;
      });
    }
    if (expected instanceof Date) return actual instanceof Date && actual.getTime() === expected.getTime();
    return actual === expected;
  });
}

function createMemoryDb() {
  const state = { users: new Map(), sessions: new Map(), tokens: new Map(), legacySessions: [] };
  let transactionTail = Promise.resolve();
  const tx = {};
  tx.user = {
    async findUnique({ where }) { return state.users.get(where.id) || null; }
  };
  tx.session = {
    async deleteMany({ where }) {
      const before = state.legacySessions.length;
      state.legacySessions = state.legacySessions.filter((session) => session.userId !== where.userId);
      return { count: before - state.legacySessions.length };
    }
  };
  tx.authSession = {
    async create({ data }) {
      const session = { lastUsedAt: null, revokedAt: null, revokeReason: null, ...data };
      state.sessions.set(session.id, session);
      return session;
    },
    async findUnique({ where, include }) {
      const session = state.sessions.get(where.id) || null;
      if (!session) return null;
      return include?.user ? { ...session, user: state.users.get(session.userId) || null } : session;
    },
    async updateMany({ where, data }) {
      const session = [...state.sessions.values()].find((item) => matches(item, where));
      if (!session) return { count: 0 };
      Object.assign(session, data);
      return { count: 1 };
    }
  };
  tx.refreshToken = {
    async create({ data }) {
      const token = { usedAt: null, parentId: null, ...data };
      state.tokens.set(token.id, token);
      return token;
    },
    async findUnique({ where, include }) {
      const token = where.id ? state.tokens.get(where.id) : [...state.tokens.values()].find((item) => item.tokenHash === where.tokenHash);
      if (!token) return null;
      if (!include?.session) return token;
      const session = state.sessions.get(token.sessionId);
      return { ...token, session: session ? { ...session, user: state.users.get(session.userId) || null } : null };
    },
    async updateMany({ where, data }) {
      const token = [...state.tokens.values()].find((item) => matches(item, where));
      if (!token) return { count: 0 };
      Object.assign(token, data);
      return { count: 1 };
    }
  };
  const db = {
    ...tx,
    async $transaction(callback) {
      const run = transactionTail.then(() => callback(tx));
      transactionTail = run.catch(() => {});
      return run;
    }
  };
  return { db, state };
}

function addActiveUser(state) {
  const user = {
    id: '537d4e6d-14d7-49d3-8de4-57a6fd737b99',
    email: 'active@example.test',
    role: 'viewer',
    status: 'ACTIVE',
    emailVerifiedAt: new Date()
  };
  state.users.set(user.id, user);
  state.legacySessions.push({ id: 'legacy-session', userId: user.id });
  return user;
}

test('login session stores only a SHA-256 refresh hash and the absolute deadline is seven days', async () => {
  const { db, state } = createMemoryDb();
  const user = addActiveUser(state);
  const service = createTokenSessionService(db);
  const session = await service.createSession(user.id);
  const storedToken = [...state.tokens.values()][0];
  assert.equal(session.expiresAt.getTime() - storedToken.issuedAt.getTime(), 7 * 24 * 60 * 60 * 1000);
  assert.equal(storedToken.tokenHash, hashRefreshToken(session.refreshToken));
  assert.equal(Object.values(storedToken).includes(session.refreshToken), false);
  assert.equal(session.refreshToken.length, 43);
  assert.equal((await service.findActiveSession(session.sessionId)).user.id, user.id);
});

test('refresh rotates atomically; concurrent use succeeds once and revokes the family on replay', async () => {
  const { db, state } = createMemoryDb();
  const user = addActiveUser(state);
  const service = createTokenSessionService(db);
  const initial = await service.createSession(user.id);
  const [first, second] = await Promise.all([service.rotate(initial.refreshToken), service.rotate(initial.refreshToken)]);
  assert.deepEqual(new Set([first.status, second.status]), new Set(['rotated', 'reuse']));
  const storedSession = state.sessions.get(initial.sessionId);
  assert.equal(storedSession.revokeReason, 'REFRESH_REUSE');
  assert.ok(storedSession.revokedAt instanceof Date);
  assert.equal(await service.findActiveSession(initial.sessionId), null);
  assert.equal(state.tokens.size, 2, 'the rotated successor remains in the family history');
});

test('expired refresh sessions are rejected and access checks revoke on account deactivation', async () => {
  const { db, state } = createMemoryDb();
  const user = addActiveUser(state);
  const service = createTokenSessionService(db);
  const expired = await service.createSession(user.id);
  state.sessions.get(expired.sessionId).expiresAt = new Date(Date.now() - 1000);
  assert.equal((await service.rotate(expired.refreshToken)).status, 'invalid');
  assert.equal(state.sessions.get(expired.sessionId).revokeReason, 'EXPIRED');

  const active = await service.createSession(user.id);
  user.status = 'PENDING';
  assert.equal(await service.findActiveSession(active.sessionId), null);
  assert.equal(state.sessions.get(active.sessionId).revokeReason, 'ACCOUNT_DEACTIVATED');
  assert.deepEqual(state.legacySessions, [], 'deactivation revokes the parallel SSR session records');
});

test('logout revokes the JWT session immediately', async () => {
  const { db, state } = createMemoryDb();
  const user = addActiveUser(state);
  const service = createTokenSessionService(db);
  const created = await service.createSession(user.id);
  assert.equal(await service.revokeSession(created.sessionId, 'LOGOUT'), true);
  assert.equal(await service.findActiveSession(created.sessionId), null);
  assert.equal(state.sessions.get(created.sessionId).revokeReason, 'LOGOUT');
});
