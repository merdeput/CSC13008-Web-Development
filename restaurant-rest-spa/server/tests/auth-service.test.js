const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createAuthService } = require('../src/services/auth-service');
const { requireAccessToken, requireRole } = require('../src/middleware/authentication');
const { requireCsrf } = require('../src/middleware/csrf');
const { signAccessToken, verifyAccessToken } = require('../src/lib/auth-crypto');

function createMemoryDb() {
  const users = new Map();
  const challenges = new Map();
  const resets = new Map();
  const refreshTokens = new Map();
  const counters = new Map();
  let nextId = 1;
  const id = () => `user-${nextId++}`;

  const matches = (record, where) => Object.entries(where).every(([key, value]) => {
    if (value === null || typeof value !== 'object' || value instanceof Date) return record[key] === value;
    if (Object.hasOwn(value, 'gt')) return record[key] > value.gt;
    return false;
  });

  const db = {
    users, challenges, resets, refreshTokens, counters,
    async $transaction(callback) { return callback(db); },
    user: {
      async findUnique({ where, include }) {
        const user = where.id ? users.get(where.id) : [...users.values()].find((item) => item.email === where.email);
        if (!user) return null;
        return include?.activationChallenge ? { ...user, activationChallenge: challenges.get(user.id) || null } : { ...user };
      },
      async create({ data }) {
        const user = { id: id(), authVersion: 0, ...data };
        users.set(user.id, user);
        return { ...user };
      },
      async updateMany({ where, data }) {
        const user = users.get(where.id);
        if (!user || (where.status && user.status !== where.status)) return { count: 0 };
        if (data.authVersion?.increment) user.authVersion += data.authVersion.increment;
        const rest = { ...data };
        delete rest.authVersion;
        Object.assign(user, rest);
        return { count: 1 };
      },
      async update({ where, data }) {
        const user = users.get(where.id);
        if (data.authVersion?.increment) user.authVersion += data.authVersion.increment;
        const rest = { ...data };
        delete rest.authVersion;
        Object.assign(user, rest);
        return { ...user };
      }
    },
    activationChallenge: {
      async create({ data }) {
        const challenge = { id: data.id || `challenge-${nextId++}`, attempts: 0, resendCount: 0, lockedUntil: null, usedAt: null, ...data };
        challenges.set(data.userId, challenge);
        return { ...challenge };
      },
      async updateMany({ where, data }) {
        const challenge = [...challenges.values()].find((item) => item.id === where.id);
        if (!challenge || !matches(challenge, where)) return { count: 0 };
        for (const [key, value] of Object.entries(data)) {
          challenge[key] = value?.increment ? challenge[key] + value.increment : value;
        }
        return { count: 1 };
      }
    },
    passwordReset: {
      async findUnique({ where }) {
        return [...resets.values()].find((item) => item.tokenHash === where.tokenHash) || null;
      },
      async upsert({ where, create, update }) {
        const existing = [...resets.values()].find((item) => item.userId === where.userId);
        if (existing) { Object.assign(existing, update); return existing; }
        const reset = { id: `reset-${nextId++}`, usedAt: null, ...create };
        resets.set(reset.id, reset);
        return reset;
      },
      async updateMany({ where, data }) {
        const reset = resets.get(where.id);
        if (!reset || !matches(reset, where)) return { count: 0 };
        Object.assign(reset, data);
        return { count: 1 };
      }
    },
    refreshToken: {
      async create({ data }) {
        const item = { id: `refresh-${nextId++}`, revokedAt: null, ...data };
        refreshTokens.set(item.id, item);
        return item;
      },
      async updateMany({ where, data }) {
        let count = 0;
        for (const item of refreshTokens.values()) {
          if (matches(item, where)) { Object.assign(item, data); count += 1; }
        }
        return { count };
      }
    },
    loginFailureCounter: {
      async findUnique({ where }) { return counters.get(`${where.keyType_keyHash.keyType}:${where.keyType_keyHash.keyHash}`) || null; },
      async upsert({ where, create, update }) {
        const key = `${where.keyType_keyHash.keyType}:${where.keyType_keyHash.keyHash}`;
        const current = counters.get(key);
        if (current) Object.assign(current, update);
        else counters.set(key, { id: `counter-${nextId++}`, ...create });
      },
      async deleteMany() { counters.clear(); }
    }
  };
  return db;
}

const secrets = {
  jwtSecret: 'jwt-test-secret-value-at-least-32-bytes-long',
  otpSecret: 'otp-test-secret-value-at-least-32-bytes-long',
  counterSecret: 'counter-test-secret-at-least-32-bytes-long',
  jwtIssuer: 'restaurant-rest-spa',
  jwtAudience: 'restaurant-rest-spa-client'
};

test('registration forces viewer and OTP activation is single use without auto-login', async () => {
  const db = createMemoryDb();
  const sentCodes = [];
  const auth = createAuthService(db, { ...secrets, makeOtp: () => '123456', sendOtp: async (_email, code) => sentCodes.push(code) });

  const result = await auth.register({ email: ' Person@example.test ', password: 'correct horse battery', role: 'admin' });
  const user = [...db.users.values()][0];
  assert.equal(user.role, 'viewer');
  assert.equal(user.status, 'PENDING');
  assert.deepEqual(sentCodes, ['123456']);
  assert.equal(Object.hasOwn(result, 'accessToken'), false);

  await assert.rejects(auth.verifyEmail({ email: user.email, code: '000000' }), (error) => error.code === 'INVALID_OTP');
  assert.equal(user.status, 'PENDING');
  await auth.verifyEmail({ email: user.email, code: '123456' });
  assert.equal(user.status, 'ACTIVE');
  await assert.rejects(auth.verifyEmail({ email: user.email, code: '123456' }), (error) => error.code === 'INVALID_OTP');
  assert.equal(user.status, 'ACTIVE');
  assert.equal(Object.hasOwn(result, 'accessToken'), false);
});

test('an expired OTP stays pending and is reported as INVALID_OTP', async () => {
  const db = createMemoryDb();
  let current = new Date('2026-11-09T00:00:00.000Z');
  const auth = createAuthService(db, {
    ...secrets,
    now: () => new Date(current),
    makeOtp: () => '222222',
    sendOtp: async () => {}
  });
  await auth.register({ email: 'expired@example.test', password: 'long password value' });
  const user = [...db.users.values()][0];
  current = new Date(current.getTime() + 11 * 60 * 1000);
  await assert.rejects(auth.verifyEmail({ email: user.email, code: '222222' }), (error) => error.code === 'INVALID_OTP');
  assert.equal(user.status, 'PENDING');
  assert.equal(db.challenges.get(user.id).usedAt, null);
});

test('OTP resend preserves attempts and the lock follows the audited 5-attempt, 15-minute policy', async () => {
  const db = createMemoryDb();
  let current = new Date('2026-11-09T00:00:00.000Z');
  let codeNumber = 0;
  const sentCodes = [];
  const codes = ['555555', '666666'];
  const auth = createAuthService(db, {
    ...secrets,
    now: () => new Date(current),
    makeOtp: () => codes[codeNumber++],
    sendOtp: async (_email, code) => sentCodes.push(code)
  });
  await auth.register({ email: 'locked@example.test', password: 'long password value' });
  const user = [...db.users.values()][0];
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await assert.rejects(auth.verifyEmail({ email: user.email, code: '000000' }), (error) => error.code === 'INVALID_OTP');
  }
  const challenge = db.challenges.get(user.id);
  assert.equal(challenge.attempts, 5);
  assert.equal(challenge.lockedUntil.getTime(), current.getTime() + 15 * 60 * 1000);
  await assert.rejects(auth.verifyEmail({ email: user.email, code: '555555' }), (error) => error.code === 'INVALID_OTP');

  current = new Date(current.getTime() + 15 * 60 * 1000 + 1000);
  await auth.resendOtp({ email: user.email });
  assert.equal(challenge.attempts, 5);
  assert.equal(sentCodes.at(-1), '666666');
  await auth.verifyEmail({ email: user.email, code: '666666' });
  assert.equal(user.status, 'ACTIVE');
});

test('pending login issues no JWT; reset is generic, single use, and invalidates old access tokens', async () => {
  const db = createMemoryDb();
  let current = new Date('2026-11-09T00:00:00.000Z');
  let resetToken = '';
  const auth = createAuthService(db, {
    ...secrets,
    now: () => new Date(current),
    makeOtp: () => '654321',
    sendOtp: async () => {},
    sendPasswordReset: async (_email, token) => { resetToken = token; }
  });

  await auth.register({ email: 'member@example.test', password: 'original password long' });
  const user = [...db.users.values()][0];
  await assert.rejects(auth.login({ email: user.email, password: 'original password long' }, '127.0.0.1'), (error) => error.code === 'ACCOUNT_PENDING');
  assert.equal(Object.hasOwn(user, 'accessToken'), false);

  await auth.verifyEmail({ email: user.email, code: '654321' });
  const loggedIn = await auth.login({ email: user.email, password: 'original password long' }, '127.0.0.1');
  assert.ok(loggedIn.accessToken);
  const claims = verifyAccessToken(loggedIn.accessToken, { secret: secrets.jwtSecret, issuer: secrets.jwtIssuer, audience: secrets.jwtAudience, now: current.getTime() });
  assert.equal(claims.exp - claims.iat, 900);
  assert.equal(claims.role, 'viewer');

  const activeMessage = await auth.forgotPassword({ email: user.email });
  const unknownMessage = await auth.forgotPassword({ email: 'missing@example.test' });
  assert.deepEqual(activeMessage, unknownMessage);
  assert.ok(resetToken);

  const resetResult = await auth.resetPassword({ token: resetToken, password: 'replacement password long' });
  assert.equal(Object.hasOwn(resetResult, 'accessToken'), false);
  assert.equal(user.authVersion, 1);
  assert.ok([...db.refreshTokens.values()].every((token) => token.revokedAt));
  await assert.rejects(auth.resetPassword({ token: resetToken, password: 'another replacement password' }), (error) => error.code === 'INVALID_RESET_TOKEN');

  const middlewareError = await new Promise((resolve) => {
    const req = { get: () => `Bearer ${loggedIn.accessToken}` };
    requireAccessToken(db, secrets)(req, {}, resolve);
  });
  assert.equal(middlewareError.status, 401);
  const newLogin = await auth.login({ email: user.email, password: 'replacement password long' }, '127.0.0.1');
  assert.ok(newLogin.accessToken);
  assert.equal(verifyAccessToken(newLogin.accessToken, { secret: secrets.jwtSecret, issuer: secrets.jwtIssuer, audience: secrets.jwtAudience, now: current.getTime() }).ver, 1);
});

test('an expired reset token does not change the password', async () => {
  const db = createMemoryDb();
  let current = new Date('2026-11-09T00:00:00.000Z');
  let resetToken = '';
  const auth = createAuthService(db, {
    ...secrets,
    now: () => new Date(current),
    makeOtp: () => '333333',
    sendOtp: async () => {},
    sendPasswordReset: async (_email, token) => { resetToken = token; }
  });
  await auth.register({ email: 'expiry-reset@example.test', password: 'original password long' });
  const user = [...db.users.values()][0];
  await auth.verifyEmail({ email: user.email, code: '333333' });
  await auth.forgotPassword({ email: user.email });
  current = new Date(current.getTime() + 31 * 60 * 1000);
  await assert.rejects(auth.resetPassword({ token: resetToken, password: 'replacement password long' }), (error) => error.code === 'INVALID_RESET_TOKEN');
  assert.equal(user.authVersion, 0);
  const login = await auth.login({ email: user.email, password: 'original password long' }, '127.0.0.1');
  assert.ok(login.accessToken);
});

test('tampered and expired JWTs fail signature and expiry checks', () => {
  const jwt = signAccessToken({ id: 'user-1', role: 'viewer', authVersion: 0 }, {
    secret: secrets.jwtSecret, issuer: secrets.jwtIssuer, audience: secrets.jwtAudience, now: 1000000, ttlSeconds: 900
  });
  const config = { secret: secrets.jwtSecret, issuer: secrets.jwtIssuer, audience: secrets.jwtAudience, now: 1000000 };
  const [header, payload, signature] = jwt.split('.');
  const altered = `${header}.${Buffer.from(JSON.stringify({ sub: 'user-1', role: 'admin', ver: 0, iss: secrets.jwtIssuer, aud: secrets.jwtAudience, iat: 1000, exp: 1900 })).toString('base64url')}.${signature}`;
  assert.equal(verifyAccessToken(jwt, config).role, 'viewer');
  assert.equal(verifyAccessToken(altered, config), null);
  assert.equal(verifyAccessToken(jwt, { ...config, now: 2000000 }), null);
});

test('admin APIs require a bearer JWT and authorize using the role stored in the database', async () => {
  const db = createMemoryDb();
  const user = { id: 'known-user', email: 'viewer@example.test', role: 'viewer', status: 'ACTIVE', authVersion: 0 };
  db.users.set(user.id, user);
  const authenticate = requireAccessToken(db, secrets);
  const missing = await new Promise((resolve) => authenticate({ get: () => '' }, {}, resolve));
  assert.equal(missing.status, 401);

  const token = signAccessToken(user, { secret: secrets.jwtSecret, issuer: secrets.jwtIssuer, audience: secrets.jwtAudience });
  const req = { get: () => `Bearer ${token}` };
  const authResult = await new Promise((resolve) => authenticate(req, {}, (error) => resolve(error || req.authUser)));
  assert.equal(authResult.role, 'viewer');
  let roleError;
  requireRole('viewer', 'admin')(req, {}, (error) => { roleError = error; });
  assert.equal(roleError, undefined);
});

test('CSRF accepts only a matching cookie/header pair from the configured origin', () => {
  const previousOrigin = process.env.CLIENT_ORIGIN;
  process.env.CLIENT_ORIGIN = 'https://spa.example.test';
  try {
    const makeRequest = (origin, header) => ({
      headers: { cookie: 'bephoi.csrf=csrf-test-value' },
      get(name) { return name === 'Origin' ? origin : header; }
    });
    let nextResult;
    requireCsrf(makeRequest('https://spa.example.test', 'csrf-test-value'), {}, (error) => { nextResult = error; });
    assert.equal(nextResult, undefined);

    requireCsrf(makeRequest('https://evil.example.test', 'csrf-test-value'), {}, (error) => { nextResult = error; });
    assert.equal(nextResult.status, 403);
    assert.equal(nextResult.code, 'CSRF_INVALID');

    requireCsrf(makeRequest('https://spa.example.test', 'wrong'), {}, (error) => { nextResult = error; });
    assert.equal(nextResult.status, 403);
    assert.equal(nextResult.code, 'CSRF_INVALID');
  } finally {
    if (previousOrigin === undefined) delete process.env.CLIENT_ORIGIN;
    else process.env.CLIENT_ORIGIN = previousOrigin;
  }
});
