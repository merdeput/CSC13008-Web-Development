const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { hashPassword } = require('../../shared/auth/password');
const { codeForStep, matchTotp } = require('../server/src/lib/totp');
const { createMfaService, encryptSecret, decryptSecret, hashRecoveryCode } = require('../server/src/services/mfa-service');

const KEY = Buffer.alloc(32, 9);
const SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
const USER_ID = '537d4e6d-14d7-49d3-8de4-57a6fd737b99';

function createMemoryDb(factor, recoveryCodes = [], user = { id: USER_ID, email: 'mfa@example.test', passwordHash: 'unused', status: 'ACTIVE', emailVerifiedAt: new Date() }) {
  const state = { factor, recoveryCodes };
  function matches(where) {
    if (!state.factor || where.userId !== state.factor.userId) return false;
    if (where.failedAttempts !== undefined && where.failedAttempts !== state.factor.failedAttempts) return false;
    if (where.lockedUntil !== undefined && String(where.lockedUntil) !== String(state.factor.lockedUntil)) return false;
    if (where.secretCiphertext !== undefined && where.secretCiphertext !== state.factor.secretCiphertext) return false;
    if (where.pendingSecretCiphertext !== undefined && where.pendingSecretCiphertext !== state.factor.pendingSecretCiphertext) return false;
    if (where.pendingExpiresAt?.gt && !(state.factor.pendingExpiresAt > where.pendingExpiresAt.gt)) return false;
    if (where.enabledAt?.not === null && !state.factor.enabledAt) return false;
    if (where.OR && !where.OR.some((condition) => {
      if (condition.lastUsedStep === null) return state.factor.lastUsedStep === null;
      return state.factor.lastUsedStep !== null && state.factor.lastUsedStep < condition.lastUsedStep.lt;
    })) return false;
    return true;
  }
  const db = {
    mfaFactor: {
      async findUnique() { return state.factor && { ...state.factor }; },
      async create({ data }) {
        state.factor = { lastUsedStep: null, failedAttempts: 0, lockedUntil: null, enabledAt: null, secretCiphertext: null, ...data };
        return state.factor;
      },
      async update({ data }) { Object.assign(state.factor, data); return state.factor; },
      async delete() { const previous = state.factor; state.factor = null; return previous; },
      async updateMany({ where, data }) {
        if (!matches(where)) return { count: 0 };
        Object.assign(state.factor, data);
        return { count: 1 };
      }
    },
    mfaRecoveryCode: {
      async count({ where }) { return state.recoveryCodes.filter((value) => value.userId === where.userId && value.usedAt === null).length; },
      async updateMany({ where, data }) {
        const row = state.recoveryCodes.find((value) => value.userId === where.userId && value.codeHash === where.codeHash && value.usedAt === null);
        if (!row) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      },
      async deleteMany({ where }) { const before = state.recoveryCodes.length; state.recoveryCodes = state.recoveryCodes.filter((value) => value.userId !== where.userId); return { count: before - state.recoveryCodes.length }; },
      async createMany({ data }) { state.recoveryCodes.push(...data.map((value) => ({ ...value, usedAt: null }))); return { count: data.length }; }
    },
    user: { async findUnique() { return user; } },
    async $transaction(run) { return run(db); }
  };
  return { db, state };
}

function enabledFactor() {
  return {
    userId: USER_ID,
    secretCiphertext: encryptSecret(SECRET, KEY, USER_ID),
    pendingSecretCiphertext: null,
    pendingExpiresAt: null,
    enabledAt: new Date('2026-01-01T00:00:00Z'),
    lastUsedStep: null,
    failedAttempts: 0,
    lockedUntil: null
  };
}

test('TOTP matches RFC 6238 SHA-1 vector and accepts only one step of clock drift in either direction', () => {
  assert.equal(codeForStep(SECRET, 1), '287082');
  const now = Date.now();
  const currentStep = Math.floor(now / 30000);
  const acceptedPreviousStep = codeForStep(SECRET, currentStep - 1);
  const acceptedNextStep = codeForStep(SECRET, currentStep + 1);
  const expiredStep = codeForStep(SECRET, currentStep - 2);
  const futureOutsideWindow = codeForStep(SECRET, currentStep + 2);
  assert.equal(matchTotp(SECRET, acceptedPreviousStep, now), currentStep - 1);
  assert.equal(matchTotp(SECRET, acceptedNextStep, now), currentStep + 1);
  assert.equal(matchTotp(SECRET, expiredStep, now), null);
  assert.equal(matchTotp(SECRET, futureOutsideWindow, now), null);
});

test('TOTP seed encryption authenticates ciphertext and never stores the plaintext seed', () => {
  const stored = encryptSecret(SECRET, KEY, USER_ID);
  assert.doesNotMatch(stored, new RegExp(SECRET));
  assert.equal(decryptSecret(stored, KEY, USER_ID), SECRET);
  assert.throws(() => decryptSecret(stored, KEY, crypto.randomUUID()));
  const pieces = stored.split('.');
  pieces[3] = Buffer.from('tampered').toString('base64url');
  assert.throws(() => decryptSecret(pieces.join('.'), KEY));
});

test('a successful TOTP can be used once only, including on parallel retries', async () => {
  const { db, state } = createMemoryDb(enabledFactor());
  const service = createMfaService(db, { encryptionKey: KEY.toString('base64url') });
  const step = Math.floor(Date.now() / 30000);
  const code = codeForStep(SECRET, step);
  const results = await Promise.all([
    service.verifyLogin({ userId: USER_ID, code }),
    service.verifyLogin({ userId: USER_ID, code })
  ]);
  assert.equal(results.filter((result) => result.status === 'valid').length, 1);
  assert.equal(state.factor.lastUsedStep, step);
});

test('invalid TOTP attempts trigger an account lockout', async () => {
  const { db, state } = createMemoryDb(enabledFactor());
  const service = createMfaService(db, { encryptionKey: KEY.toString('base64url') });
  let result;
  for (let attempt = 0; attempt < 5; attempt += 1) result = await service.verifyLogin({ userId: USER_ID, code: '000000' });
  assert.equal(result.status, 'locked');
  assert.ok(state.factor.lockedUntil > new Date());
  assert.equal((await service.verifyLogin({ userId: USER_ID, code: codeForStep(SECRET, Math.floor(Date.now() / 30000)) })).status, 'locked');
});

test('recovery codes are hash-stored and consumed exactly once', async () => {
  const code = crypto.randomBytes(16).toString('hex').toUpperCase();
  const recoveryCode = { userId: USER_ID, codeHash: hashRecoveryCode(code, USER_ID), usedAt: null };
  const { db, state } = createMemoryDb(enabledFactor(), [recoveryCode]);
  const service = createMfaService(db, { encryptionKey: KEY.toString('base64url') });
  assert.equal((await service.verifyLogin({ userId: USER_ID, code })).status, 'valid');
  assert.ok(state.recoveryCodes[0].usedAt);
  assert.equal((await service.verifyLogin({ userId: USER_ID, code })).status, 'invalid');
});

test('enrollment stays inactive until a fresh TOTP verifies and returns one-time recovery codes', async () => {
  const password = 'Correct Horse Battery Staple';
  const user = { id: USER_ID, email: 'mfa@example.test', passwordHash: await hashPassword(password), status: 'ACTIVE', emailVerifiedAt: new Date() };
  const { db, state } = createMemoryDb(null, [], user);
  const service = createMfaService(db, { encryptionKey: KEY.toString('base64url') });
  const started = await service.beginSetup({ userId: USER_ID, password });
  assert.equal(started.status, 'started');
  assert.equal(state.factor.enabledAt, null);
  assert.equal(state.factor.secretCiphertext, null);
  assert.ok(started.qrCodeDataUrl.startsWith('data:image/png;base64,'));
  assert.equal((await service.confirmSetup({ userId: USER_ID, code: '000000' })).status, 'invalid');
  const code = codeForStep(started.secret, Math.floor(Date.now() / 30000));
  const enabled = await service.confirmSetup({ userId: USER_ID, code });
  assert.equal(enabled.status, 'enabled');
  assert.equal(enabled.recoveryCodes.length, 10);
  assert.ok(state.factor.enabledAt);
  assert.notEqual(state.factor.secretCiphertext, started.secret);
  assert.equal(state.recoveryCodes.length, 10);
  assert.equal(state.recoveryCodes.some((row) => enabled.recoveryCodes.includes(row.codeHash)), false);
});

test('replacing or disabling MFA requires the password and current MFA proof', async () => {
  const password = 'Correct Horse Battery Staple';
  const user = { id: USER_ID, email: 'mfa@example.test', passwordHash: await hashPassword(password), status: 'ACTIVE', emailVerifiedAt: new Date() };
  const existing = enabledFactor();
  const originalSecret = existing.secretCiphertext;
  const replaceDb = createMemoryDb(existing, [], user);
  const replaceService = createMfaService(replaceDb.db, { encryptionKey: KEY.toString('base64url') });
  assert.equal((await replaceService.beginSetup({ userId: USER_ID, password: 'wrong password', code: '000000' })).status, 'reauth_required');
  assert.equal((await replaceService.beginSetup({ userId: USER_ID, password, code: '' })).status, 'invalid');
  const currentCode = codeForStep(SECRET, Math.floor(Date.now() / 30000));
  assert.equal((await replaceService.beginSetup({ userId: USER_ID, password, code: currentCode })).status, 'started');
  assert.equal(replaceDb.state.factor.secretCiphertext, originalSecret);
  assert.ok(replaceDb.state.factor.pendingSecretCiphertext);

  const disableDb = createMemoryDb(enabledFactor(), [], user);
  const disableService = createMfaService(disableDb.db, { encryptionKey: KEY.toString('base64url') });
  assert.equal((await disableService.disable({ userId: USER_ID, password: 'wrong password', code: currentCode })).status, 'reauth_required');
  assert.equal((await disableService.disable({ userId: USER_ID, password, code: currentCode })).status, 'disabled');
  assert.equal(disableDb.state.factor, null);
});
