const crypto = require('node:crypto');
const QRCode = require('qrcode');
const { verifyPassword } = require('../../../../shared/auth/password');
const { createSecret, matchTotp, otpauthUri } = require('../lib/totp');

const MAX_FAILURES = 5;
const LOCKOUT_MS = 15 * 60 * 1000;
const SETUP_TTL_MS = 10 * 60 * 1000;
const RECOVERY_CODE_COUNT = 10;

function getEncryptionKey(value = process.env.MFA_ENCRYPTION_KEY) {
  if (typeof value !== 'string' || !value) throw new Error('MFA_ENCRYPTION_KEY must be configured as a base64url encoded 32-byte key.');
  const key = Buffer.from(value, 'base64url');
  if (key.length !== 32 || key.toString('base64url') !== value) throw new Error('MFA_ENCRYPTION_KEY must be configured as a base64url encoded 32-byte key.');
  return key;
}

function encryptSecret(secret, key, userId) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(`bephoi-totp:v1:${userId}`, 'utf8'));
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return `v1.${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${ciphertext.toString('base64url')}`;
}

function decryptSecret(value, key, userId) {
  const [version, ivText, tagText, ciphertextText, extra] = String(value || '').split('.');
  if (version !== 'v1' || !ivText || !tagText || !ciphertextText || extra !== undefined) throw new Error('Invalid encrypted MFA secret.');
  const iv = Buffer.from(ivText, 'base64url');
  const tag = Buffer.from(tagText, 'base64url');
  const ciphertext = Buffer.from(ciphertextText, 'base64url');
  if (iv.length !== 12 || tag.length !== 16 || !ciphertext.length) throw new Error('Invalid encrypted MFA secret.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAAD(Buffer.from(`bephoi-totp:v1:${userId}`, 'utf8'));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

function normalizeRecoveryCode(value) {
  return typeof value === 'string' ? value.toUpperCase().replace(/[\s-]/gu, '') : '';
}

function hashRecoveryCode(value, userId) {
  return crypto.createHash('sha256').update(`bephoi-recovery:v1:${userId}:${normalizeRecoveryCode(value)}`, 'utf8').digest('hex');
}

function makeRecoveryCodes() {
  return Array.from({ length: RECOVERY_CODE_COUNT }, () => crypto.randomBytes(16).toString('hex').toUpperCase().match(/.{4}/gu).join('-'));
}

function createMfaService(db, options = {}) {
  const encryptionKey = getEncryptionKey(options.encryptionKey);

  async function recordFailure(tx, factor, now) {
    let current = factor;
    while (current) {
      if (current.lockedUntil && current.lockedUntil > now) return { status: 'locked', lockedUntil: current.lockedUntil };
      const previous = current.lockedUntil && current.lockedUntil <= now ? 0 : current.failedAttempts;
      const failedAttempts = previous + 1;
      const lockedUntil = failedAttempts >= MAX_FAILURES ? new Date(now.getTime() + LOCKOUT_MS) : null;
      const update = await tx.mfaFactor.updateMany({
        where: { userId: current.userId, failedAttempts: current.failedAttempts, lockedUntil: current.lockedUntil },
        data: { failedAttempts, lockedUntil }
      });
      if (update.count) return lockedUntil ? { status: 'locked', lockedUntil } : { status: 'invalid' };
      current = await tx.mfaFactor.findUnique({ where: { userId: current.userId } });
    }
    return { status: 'invalid' };
  }

  async function consumeCode(tx, factor, code, now) {
    if (!factor?.enabledAt || !factor.secretCiphertext) return { status: 'not_enabled' };
    if (factor.lockedUntil && factor.lockedUntil > now) return { status: 'locked', lockedUntil: factor.lockedUntil };

    const normalized = normalizeRecoveryCode(code);
    if (/^[A-F0-9]{32}$/u.test(normalized)) {
      const recoveryHash = hashRecoveryCode(normalized, factor.userId);
      const used = await tx.mfaRecoveryCode.updateMany({
        where: { userId: factor.userId, codeHash: recoveryHash, usedAt: null },
        data: { usedAt: now }
      });
      if (used.count) {
        await tx.mfaFactor.updateMany({
          where: { userId: factor.userId, enabledAt: { not: null } },
          data: { failedAttempts: 0, lockedUntil: null }
        });
        return { status: 'valid', recovery: true };
      }
      return recordFailure(tx, factor, now);
    }

    let current = factor;
    while (current) {
      if (!current.enabledAt || !current.secretCiphertext) return { status: 'not_enabled' };
      if (current.lockedUntil && current.lockedUntil > now) return { status: 'locked', lockedUntil: current.lockedUntil };
      let secret;
      try { secret = decryptSecret(current.secretCiphertext, encryptionKey, current.userId); }
      catch { return { status: 'unavailable' }; }
      const step = matchTotp(secret, code, now.getTime(), 1);
      if (step === null || (current.lastUsedStep !== null && current.lastUsedStep >= step)) return recordFailure(tx, current, now);

      const consumed = await tx.mfaFactor.updateMany({
        where: {
          userId: current.userId,
          secretCiphertext: current.secretCiphertext,
          enabledAt: { not: null },
          failedAttempts: current.failedAttempts,
          lockedUntil: current.lockedUntil,
          OR: [{ lastUsedStep: null }, { lastUsedStep: { lt: step } }]
        },
        data: { lastUsedStep: step, failedAttempts: 0, lockedUntil: null }
      });
      if (consumed.count) return { status: 'valid', recovery: false, step };
      current = await tx.mfaFactor.findUnique({ where: { userId: current.userId } });
    }
    return { status: 'not_enabled' };
  }

  async function reauthenticate(tx, userId, password, code, now) {
    if (typeof password !== 'string' || !password || Buffer.byteLength(password, 'utf8') > 128) return { status: 'reauth_required' };
    const user = await tx.user.findUnique({ where: { id: userId }, select: { id: true, email: true, passwordHash: true, status: true, emailVerifiedAt: true } });
    if (!user || user.status !== 'ACTIVE' || !user.emailVerifiedAt || !(await verifyPassword(password, user.passwordHash))) return { status: 'reauth_required' };
    const factor = await tx.mfaFactor.findUnique({ where: { userId } });
    if (factor?.enabledAt) {
      const result = await consumeCode(tx, factor, code, now);
      if (result.status !== 'valid') return result.status === 'not_enabled' ? { status: 'reauth_required' } : result;
    }
    return { status: 'valid', user, factor };
  }

  return {
    async status(userId) {
      const factor = await db.mfaFactor.findUnique({ where: { userId }, select: { enabledAt: true, pendingExpiresAt: true } });
      const recoveryCodesRemaining = factor?.enabledAt
        ? await db.mfaRecoveryCode.count({ where: { userId, usedAt: null } })
        : 0;
      return { enabled: Boolean(factor?.enabledAt), pending: Boolean(factor?.pendingExpiresAt && factor.pendingExpiresAt > new Date()), recoveryCodesRemaining };
    },

    async beginSetup({ userId, password, code }) {
      const now = new Date();
      return db.$transaction(async (tx) => {
        const auth = await reauthenticate(tx, userId, password, code, now);
        if (auth.status !== 'valid') return auth;
        const secret = createSecret();
        const pendingExpiresAt = new Date(now.getTime() + SETUP_TTL_MS);
        const pendingSecretCiphertext = encryptSecret(secret, encryptionKey, userId);
        if (auth.factor) {
          await tx.mfaFactor.update({
            where: { userId },
            data: { pendingSecretCiphertext, pendingExpiresAt }
          });
        } else {
          await tx.mfaFactor.create({ data: { userId, pendingSecretCiphertext, pendingExpiresAt } });
        }
        const uri = otpauthUri(secret, auth.user.email);
        const qrCodeDataUrl = await QRCode.toDataURL(uri, { errorCorrectionLevel: 'M', margin: 1, width: 240 });
        return { status: 'started', secret, otpauthUri: uri, qrCodeDataUrl, expiresAt: pendingExpiresAt };
      });
    },

    async confirmSetup({ userId, code }) {
      const now = new Date();
      return db.$transaction(async (tx) => {
        const factor = await tx.mfaFactor.findUnique({ where: { userId } });
        if (!factor?.pendingSecretCiphertext || !factor.pendingExpiresAt || factor.pendingExpiresAt <= now) return { status: 'expired' };
        if (factor.lockedUntil && factor.lockedUntil > now) return { status: 'locked', lockedUntil: factor.lockedUntil };
        let secret;
        try { secret = decryptSecret(factor.pendingSecretCiphertext, encryptionKey, userId); }
        catch { return { status: 'unavailable' }; }
        const step = matchTotp(secret, code, now.getTime(), 1);
        if (step === null) return recordFailure(tx, factor, now);

        const enabled = await tx.mfaFactor.updateMany({
          where: {
            userId,
            pendingSecretCiphertext: factor.pendingSecretCiphertext,
            pendingExpiresAt: { gt: now }
          },
          data: {
            secretCiphertext: factor.pendingSecretCiphertext,
            pendingSecretCiphertext: null,
            pendingExpiresAt: null,
            enabledAt: now,
            lastUsedStep: step,
            failedAttempts: 0,
            lockedUntil: null
          }
        });
        if (!enabled.count) return { status: 'replay' };

        const codes = makeRecoveryCodes();
        await tx.mfaRecoveryCode.deleteMany({ where: { userId } });
        await tx.mfaRecoveryCode.createMany({ data: codes.map((value) => ({ userId, codeHash: hashRecoveryCode(value, userId) })) });
        return { status: 'enabled', recoveryCodes: codes };
      });
    },

    async verifyLogin({ userId, code }) {
      const now = new Date();
      return db.$transaction(async (tx) => {
        const factor = await tx.mfaFactor.findUnique({ where: { userId } });
        if (!factor?.enabledAt) return { status: 'not_enabled' };
        return consumeCode(tx, factor, code, now);
      });
    },

    async disable({ userId, password, code }) {
      const now = new Date();
      return db.$transaction(async (tx) => {
        const auth = await reauthenticate(tx, userId, password, code, now);
        if (auth.status !== 'valid' || !auth.factor?.enabledAt) return auth.status === 'valid' ? { status: 'not_enabled' } : auth;
        await tx.mfaRecoveryCode.deleteMany({ where: { userId } });
        await tx.mfaFactor.delete({ where: { userId } });
        return { status: 'disabled' };
      });
    },

    async refreshRecoveryCodes({ userId, password, code }) {
      const now = new Date();
      return db.$transaction(async (tx) => {
        const auth = await reauthenticate(tx, userId, password, code, now);
        if (auth.status !== 'valid' || !auth.factor?.enabledAt) return auth.status === 'valid' ? { status: 'not_enabled' } : auth;
        const recoveryCodes = makeRecoveryCodes();
        await tx.mfaRecoveryCode.deleteMany({ where: { userId } });
        await tx.mfaRecoveryCode.createMany({ data: recoveryCodes.map((value) => ({ userId, codeHash: hashRecoveryCode(value, userId) })) });
        return { status: 'replaced', recoveryCodes };
      });
    }
  };
}

module.exports = {
  MAX_FAILURES, LOCKOUT_MS, SETUP_TTL_MS, RECOVERY_CODE_COUNT,
  getEncryptionKey, encryptSecret, decryptSecret, hashRecoveryCode, normalizeRecoveryCode, createMfaService
};
