const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createAuthService } = require('../src/services/auth-service');

process.env.OTP_HMAC_SECRET = 'test-otp-hmac-secret-123456789012';
process.env.LOGIN_COUNTER_HMAC_SECRET = 'test-login-counter-secret-123456789';
process.env.RESEND_API_KEY = 'test-resend-api-key';
process.env.EMAIL_FROM = 'Bep Hoi <noreply@example.test>';

function matchesWhere(record, where) {
  return Object.entries(where).every(([key, expected]) => {
    if (key === 'OR') return expected.some((clause) => matchesWhere(record, clause));
    const actual = record[key];
    if (key === 'userId_purpose') return actual === undefined
      && record.userId === expected.userId && record.purpose === expected.purpose;
    if (expected instanceof Date) return actual instanceof Date && actual.getTime() === expected.getTime();
    if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
      return Object.entries(expected).every(([operator, value]) => {
        if (operator === 'gt') return actual > value;
        if (operator === 'gte') return actual >= value;
        if (operator === 'lt') return actual < value;
        if (operator === 'lte') return actual <= value;
        return false;
      });
    }
    return actual === expected;
  });
}

function applyData(record, data) {
  for (const [key, value] of Object.entries(data)) {
    if (value && typeof value === 'object' && Object.hasOwn(value, 'increment')) record[key] += value.increment;
    else record[key] = value;
  }
}

function makeAuthDb() {
  const state = { users: [], challenges: [] };
  const db = {
    $transaction: async (callback) => callback(db),
    user: {
      findUnique: async ({ where }) => state.users.find((user) => matchesWhere(user, where)) || null,
      create: async ({ data }) => {
        const user = { id: crypto.randomUUID(), createdAt: new Date(), role: 'viewer', status: 'PENDING', emailVerifiedAt: null, ...data };
        state.users.push(user);
        return user;
      },
      updateMany: async ({ where, data }) => {
        const user = state.users.find((item) => matchesWhere(item, where));
        if (!user) return { count: 0 };
        applyData(user, data);
        return { count: 1 };
      }
    },
    activationChallenge: {
      create: async ({ data }) => {
        const challenge = { attempts: 0, resendCount: 0, lockedUntil: null, usedAt: null, createdAt: new Date(), ...data };
        state.challenges.push(challenge);
        return challenge;
      },
      findUnique: async ({ where }) => state.challenges.find((challenge) => matchesWhere(challenge, where)) || null,
      updateMany: async ({ where, data }) => {
        const challenge = state.challenges.find((item) => matchesWhere(item, where));
        if (!challenge) return { count: 0 };
        applyData(challenge, data);
        return { count: 1 };
      }
    }
  };
  return { db, state };
}

async function withCapturedEmail(callback) {
  const originalFetch = global.fetch;
  const messages = [];
  global.fetch = async (_url, options) => {
    messages.push(JSON.parse(options.body));
    return { ok: true };
  };
  try {
    return await callback(messages);
  } finally {
    global.fetch = originalFetch;
  }
}

function getCode(message) {
  const match = message.text.match(/\b\d{6}\b/);
  assert.ok(match, 'email body includes a six digit activation code');
  return match[0];
}

test('registration stores a pending viewer and duplicate emails do not create or send extra challenges', async () => {
  await withCapturedEmail(async (messages) => {
    const { db, state } = makeAuthDb();
    const auth = createAuthService(db);
    const first = await auth.beginRegistration({ email: '  Example@Email.Test ', passwordHash: 'scrypt$test-hash' });
    assert.equal(first.created, true);
    assert.equal(state.users.length, 1);
    assert.equal(state.users[0].email, 'example@email.test');
    assert.equal(state.users[0].status, 'PENDING');
    assert.equal(state.users[0].role, 'viewer');
    assert.equal(state.users[0].emailVerifiedAt, null);

    const challenge = state.challenges[0];
    const code = getCode(messages[0]);
    assert.equal(challenge.userId, first.userId);
    assert.equal(challenge.purpose, 'ACTIVATION');
    assert.match(challenge.otpHash, /^[a-f0-9]{64}$/);
    assert.notEqual(challenge.otpHash, code);
    assert.equal(Object.hasOwn(first, 'code'), false);

    const duplicatePending = await auth.beginRegistration({ email: 'example@email.test', passwordHash: 'scrypt$another-hash' });
    assert.deepEqual(duplicatePending, { userId: first.userId, created: false });
    assert.equal(messages.length, 1);
    assert.equal(state.users.length, 1);

    assert.equal((await auth.activateAccount(first.userId, code)).status, 'activated');
    assert.equal(state.users[0].status, 'ACTIVE');
    assert.ok(state.users[0].emailVerifiedAt instanceof Date);
    assert.ok(state.challenges[0].usedAt instanceof Date);
    assert.equal((await auth.activateAccount(first.userId, code)).status, 'invalid', 'the code cannot be replayed');

    const duplicateActive = await auth.beginRegistration({ email: 'example@email.test', passwordHash: 'scrypt$ignored-hash' });
    assert.deepEqual(duplicateActive, { userId: null, created: false });
    assert.equal(messages.length, 1);
    assert.equal(state.users.length, 1);
  });
});

test('email provider rejection keeps the pending account and returns only an internal delivery error code', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({ ok: false, status: 403 });
  try {
    const { db, state } = makeAuthDb();
    const auth = createAuthService(db);
    const result = await auth.beginRegistration({ email: 'delivery@example.test', passwordHash: 'scrypt$test-hash' });
    assert.equal(result.userId, state.users[0].id);
    assert.equal(result.deliveryErrorCode, 'EMAIL_PROVIDER_HTTP_403');
    assert.equal(state.users[0].status, 'PENDING');
    assert.equal(state.challenges.length, 1);
    assert.equal(Object.hasOwn(result, 'code'), false);
  } finally {
    global.fetch = originalFetch;
  }
});

test('expired OTPs are rejected and resending preserves the accumulated attempt count', async () => {
  await withCapturedEmail(async (messages) => {
    const { db, state } = makeAuthDb();
    const auth = createAuthService(db);
    const { userId } = await auth.beginRegistration({ email: 'resend@example.test', passwordHash: 'scrypt$test-hash' });
    const originalCode = getCode(messages[0]);
    const challenge = state.challenges[0];

    challenge.expiresAt = new Date(Date.now() - 1);
    assert.equal((await auth.activateAccount(userId, originalCode)).status, 'invalid');
    challenge.expiresAt = new Date(Date.now() + 60_000);

    const wrongCode = originalCode === '000000' ? '111111' : '000000';
    assert.equal((await auth.activateAccount(userId, wrongCode)).status, 'invalid');
    assert.equal((await auth.activateAccount(userId, wrongCode)).status, 'invalid');
    assert.equal(challenge.attempts, 2);
    challenge.lastSentAt = new Date(Date.now() - 61_000);

    assert.deepEqual(await auth.resendActivationCode(userId), { status: 'sent' });
    assert.equal(challenge.attempts, 2);
    assert.equal(challenge.resendCount, 1);
    assert.notEqual(challenge.otpHash, originalCode);
    const replacementCode = getCode(messages[1]);
    assert.equal((await auth.activateAccount(userId, replacementCode)).status, 'activated');
  });
});

test('activation challenge applies its attempt lockout', async () => {
  await withCapturedEmail(async (messages) => {
    const { db, state } = makeAuthDb();
    const auth = createAuthService(db);
    const { userId } = await auth.beginRegistration({ email: 'locked@example.test', passwordHash: 'scrypt$test-hash' });
    const correctCode = getCode(messages[0]);
    const wrongCode = correctCode === '999999' ? '000000' : '999999';

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const result = await auth.activateAccount(userId, wrongCode);
      assert.equal(result.status, attempt === 5 ? 'locked' : 'invalid');
    }
    assert.equal(state.challenges[0].attempts, 5);
    assert.ok(state.challenges[0].lockedUntil > new Date());
    assert.equal((await auth.activateAccount(userId, correctCode)).status, 'locked');
    assert.equal((await auth.resendActivationCode(userId)).status, 'locked');
  });
});
