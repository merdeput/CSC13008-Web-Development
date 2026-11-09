const crypto = require('node:crypto');
const { HttpError } = require('../lib/errors');
const { hashPassword, verifyPassword, sha256, hmacHex, makeOpaqueToken, signAccessToken, safeEqual } = require('../lib/auth-crypto');

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
const OTP_MAX_RESENDS = 5;
const OTP_MAX_ATTEMPTS = 5;
const OTP_LOCK_MS = 15 * 60 * 1000;
const RESET_TTL_MS = 30 * 60 * 1000;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILURES = 10;
const LOGIN_LOCK_MS = 15 * 60 * 1000;
const ACCESS_TTL_SECONDS = 15 * 60;
const REFRESH_TTL_SECONDS = Number(process.env.JWT_REFRESH_TTL_SECONDS) || 7 * 24 * 60 * 60;
const GENERIC_FORGOT_MESSAGE = 'Nếu email có tài khoản đang hoạt động, hướng dẫn đặt lại mật khẩu sẽ được gửi đến hộp thư đó.';
const GENERIC_REGISTER_MESSAGE = 'Nếu địa chỉ email đủ điều kiện đăng ký, mã xác minh sẽ được gửi đến hộp thư đó.';

function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function validEmail(value) {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function validPassword(value) {
  return typeof value === 'string' && Array.from(value).length >= 12 && Buffer.byteLength(value, 'utf8') <= 128;
}

function publicUser(user) {
  return { id: user.id, email: user.email, role: user.role };
}

function accessConfig(options) {
  const secret = options.jwtSecret || process.env.JWT_ACCESS_SECRET;
  if (typeof secret !== 'string' || Buffer.byteLength(secret) < 32) {
    throw new HttpError(503, 'Xác thực chưa được cấu hình trên máy chủ.', { code: 'AUTH_UNAVAILABLE' });
  }
  return {
    secret,
    issuer: options.jwtIssuer || process.env.JWT_ISSUER || 'restaurant-rest-spa',
    audience: options.jwtAudience || process.env.JWT_AUDIENCE || 'restaurant-rest-spa-client',
    ttlSeconds: ACCESS_TTL_SECONDS,
    now: options.now ? options.now().getTime() : Date.now()
  };
}

function oneTimeCode() {
  return crypto.randomInt(0, 1000000).toString().padStart(6, '0');
}

function invalidOtp() {
  return new HttpError(400, 'Mã OTP không hợp lệ, đã hết hạn hoặc đã được sử dụng.', { code: 'INVALID_OTP' });
}

function invalidResetToken() {
  return new HttpError(400, 'Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.', { code: 'INVALID_RESET_TOKEN' });
}

function createAuthService(db, options = {}) {
  const now = options.now || (() => new Date());
  const sendOtp = options.sendOtp || (async () => { throw new Error('OTP email sender is not configured.'); });
  const sendPasswordReset = options.sendPasswordReset || (async () => { throw new Error('Password reset email sender is not configured.'); });
  const otpSecret = options.otpSecret || process.env.OTP_HMAC_SECRET;
  const counterSecret = options.counterSecret || process.env.LOGIN_COUNTER_HMAC_SECRET || process.env.JWT_ACCESS_SECRET;

  function requireOtpSecret() {
    if (typeof otpSecret !== 'string' || Buffer.byteLength(otpSecret) < 32) {
      throw new HttpError(503, 'OTP chưa được cấu hình trên máy chủ.', { code: 'AUTH_UNAVAILABLE' });
    }
  }

  function counterHash(type, value) {
    if (typeof counterSecret !== 'string' || Buffer.byteLength(counterSecret) < 32) {
      throw new HttpError(503, 'Đăng nhập chưa được cấu hình trên máy chủ.', { code: 'AUTH_UNAVAILABLE' });
    }
    return hmacHex(counterSecret, `${type}:${value}`);
  }

  async function issueRefreshToken(tx, user, familyId = crypto.randomUUID()) {
    const token = makeOpaqueToken(32);
    const expiresAt = new Date(now().getTime() + REFRESH_TTL_SECONDS * 1000);
    await tx.refreshToken.create({ data: { userId: user.id, familyId, tokenHash: sha256(token), expiresAt } });
    return { token, expiresAt };
  }

  function makeAccessToken(user) {
    return signAccessToken(user, accessConfig(options));
  }

  async function loginLockout(email, ip) {
    const at = now();
    const checks = [
      ['email', counterHash('email', email)],
      ['ip', counterHash('ip', ip || 'unknown')]
    ];
    const counters = await Promise.all(checks.map(([keyType, keyHash]) => db.loginFailureCounter.findUnique({ where: { keyType_keyHash: { keyType, keyHash } } })));
    return counters.some((counter) => counter?.lockedUntil && counter.lockedUntil > at);
  }

  async function recordLoginFailure(email, ip) {
    const at = now();
    const windowStart = new Date(at.getTime() - LOGIN_WINDOW_MS);
    for (const [keyType, value] of [['email', email], ['ip', ip || 'unknown']]) {
      const keyHash = counterHash(keyType, value);
      const where = { keyType_keyHash: { keyType, keyHash } };
      const current = await db.loginFailureCounter.findUnique({ where });
      if (!current || current.windowStartedAt <= windowStart) {
        await db.loginFailureCounter.upsert({
          where,
          create: { keyType, keyHash, failureCount: 1, windowStartedAt: at },
          update: { failureCount: 1, windowStartedAt: at, lockedUntil: null, updatedAt: at }
        });
        continue;
      }
      const count = current.failureCount + 1;
      await db.loginFailureCounter.update({
        where: { id: current.id },
        data: {
          failureCount: { increment: 1 },
          lockedUntil: count >= LOGIN_MAX_FAILURES ? new Date(at.getTime() + LOGIN_LOCK_MS) : current.lockedUntil,
          updatedAt: at
        }
      });
    }
  }

  return {
    async register(input) {
      const email = normalizeEmail(input.email);
      const password = input.password;
      if (!validEmail(email)) throw new HttpError(400, 'Nhập địa chỉ email hợp lệ.', { code: 'VALIDATION_FAILED' });
      if (!validPassword(password)) throw new HttpError(400, 'Mật khẩu cần có ít nhất 12 ký tự và tối đa 128 byte.', { code: 'VALIDATION_FAILED' });
      requireOtpSecret();
      const existing = await db.user.findUnique({ where: { email }, select: { id: true } });
      if (existing) return { message: GENERIC_REGISTER_MESSAGE };

      const passwordHash = await hashPassword(password);
      const code = (options.makeOtp || oneTimeCode)();
      const at = now();
      const challengeId = crypto.randomUUID();
      let user;
      try {
        user = await db.$transaction(async (tx) => {
          const created = await tx.user.create({
            data: { email, passwordHash, role: 'viewer', status: 'PENDING' },
            select: { id: true, email: true, role: true }
          });
          await tx.activationChallenge.create({
            data: {
              id: challengeId,
              userId: created.id,
              otpHash: hmacHex(otpSecret, `${challengeId}:${code}`),
              expiresAt: new Date(at.getTime() + OTP_TTL_MS),
              lastSentAt: at
            }
          });
          return created;
        });
      } catch (error) {
        if (error?.code === 'P2002') return { message: GENERIC_REGISTER_MESSAGE };
        throw error;
      }

      try { await sendOtp(user.email, code); }
      catch (error) {
        console.error('Registration OTP delivery failed.', error?.name || 'Error', error?.code || '');
      }
      return { message: GENERIC_REGISTER_MESSAGE };
    },

    async verifyEmail(input) {
      const email = normalizeEmail(input.email);
      const code = typeof input.code === 'string' ? input.code.trim() : '';
      if (!validEmail(email) || !/^\d{6}$/.test(code)) throw invalidOtp();
      requireOtpSecret();
      const at = now();
      let result;
      try {
        result = await db.$transaction(async (tx) => {
          const user = await tx.user.findUnique({ where: { email }, include: { activationChallenge: true } });
          const challenge = user?.activationChallenge;
          if (!user || user.status !== 'PENDING' || !challenge || challenge.usedAt || challenge.expiresAt <= at
            || (challenge.lockedUntil && challenge.lockedUntil > at)) return 'invalid';
          if (!safeEqual(challenge.otpHash, hmacHex(otpSecret, `${challenge.id}:${code}`))) {
            const attempts = challenge.attempts + 1;
            await tx.activationChallenge.updateMany({
              where: { id: challenge.id, usedAt: null, otpHash: challenge.otpHash, attempts: challenge.attempts },
              data: {
                attempts: { increment: 1 },
                ...(attempts % OTP_MAX_ATTEMPTS === 0 ? { lockedUntil: new Date(at.getTime() + OTP_LOCK_MS) } : {})
              }
            });
            return 'invalid';
          }
          const claimed = await tx.activationChallenge.updateMany({
            where: {
              id: challenge.id,
              usedAt: null,
              otpHash: challenge.otpHash,
              attempts: challenge.attempts,
              expiresAt: { gt: at }
            },
            data: { usedAt: at }
          });
          if (claimed.count !== 1) return 'invalid';
          const updated = await tx.user.updateMany({ where: { id: user.id, status: 'PENDING' }, data: { status: 'ACTIVE', emailVerifiedAt: at } });
          if (updated.count !== 1) throw new Error('OTP_ACTIVATION_ROLLBACK');
          return 'activated';
        });
      } catch (error) {
        if (error?.message === 'OTP_ACTIVATION_ROLLBACK') throw invalidOtp();
        throw error;
      }
      if (result !== 'activated') throw invalidOtp();
      return { message: 'Email đã được xác minh. Hãy đăng nhập để tiếp tục.' };
    },

    async resendOtp(input) {
      const email = normalizeEmail(input.email);
      if (!validEmail(email)) return { message: GENERIC_REGISTER_MESSAGE };
      requireOtpSecret();
      const user = await db.user.findUnique({ where: { email }, include: { activationChallenge: true } });
      const challenge = user?.activationChallenge;
      if (!user || user.status !== 'PENDING' || !challenge || challenge.usedAt) return { message: GENERIC_REGISTER_MESSAGE };
      const at = now();
      if (challenge.resendCount >= OTP_MAX_RESENDS) return { message: GENERIC_REGISTER_MESSAGE };
      if (challenge.lastSentAt.getTime() + OTP_RESEND_COOLDOWN_MS > at.getTime()) return { message: GENERIC_REGISTER_MESSAGE };
      const code = (options.makeOtp || oneTimeCode)();
      const changed = await db.activationChallenge.updateMany({
        where: { id: challenge.id, usedAt: null, attempts: challenge.attempts, resendCount: challenge.resendCount },
        data: {
          otpHash: hmacHex(otpSecret, `${challenge.id}:${code}`),
          expiresAt: new Date(at.getTime() + OTP_TTL_MS),
          lastSentAt: at,
          resendCount: { increment: 1 }
        }
      });
      if (!changed.count) return { message: GENERIC_REGISTER_MESSAGE };
      try { await sendOtp(user.email, code); }
      catch (error) { console.error('OTP resend delivery failed.', error?.name || 'Error', error?.code || ''); }
      return { message: GENERIC_REGISTER_MESSAGE };
    },

    async login(input, ip) {
      const email = normalizeEmail(input.email);
      const password = typeof input.password === 'string' ? input.password : '';
      if (await loginLockout(email, ip)) throw new HttpError(429, 'Đã đạt giới hạn đăng nhập. Vui lòng thử lại sau.', { code: 'RATE_LIMITED' });
      const user = validEmail(email) ? await db.user.findUnique({ where: { email } }) : null;
      if (!user) {
        await recordLoginFailure(email || 'invalid', ip);
        throw new HttpError(401, 'Email hoặc mật khẩu không chính xác.', { code: 'INVALID_CREDENTIALS' });
      }
      if (user.status !== 'ACTIVE') throw new HttpError(401, 'Tài khoản chưa được xác minh.', { code: 'ACCOUNT_PENDING' });
      if (!await verifyPassword(password, user.passwordHash)) {
        await recordLoginFailure(email, ip);
        throw new HttpError(401, 'Email hoặc mật khẩu không chính xác.', { code: 'INVALID_CREDENTIALS' });
      }
      const keyHash = counterHash('email', email);
      await db.loginFailureCounter.deleteMany({ where: { keyType: 'email', keyHash } });
      const refresh = await db.$transaction((tx) => issueRefreshToken(tx, user));
      return { accessToken: makeAccessToken(user), refreshToken: refresh.token, refreshExpiresAt: refresh.expiresAt, user: publicUser(user) };
    },

    async refresh(rawToken) {
      if (typeof rawToken !== 'string' || rawToken.length < 40 || rawToken.length > 80) {
        throw new HttpError(401, 'Phiên đăng nhập đã hết hạn.', { code: 'UNAUTHENTICATED' });
      }
      const tokenHash = sha256(rawToken);
      const at = now();
      const nextToken = makeOpaqueToken(32);
      const rotated = await db.$transaction(async (tx) => {
        const current = await tx.refreshToken.findUnique({ where: { tokenHash }, include: { user: true } });
        if (!current) return null;
        if (current.revokedAt) {
          await tx.refreshToken.updateMany({ where: { familyId: current.familyId, revokedAt: null }, data: { revokedAt: at } });
          return null;
        }
        if (current.expiresAt <= at || current.user.status !== 'ACTIVE') return null;
        const revoked = await tx.refreshToken.updateMany({ where: { id: current.id, revokedAt: null, expiresAt: { gt: at } }, data: { revokedAt: at } });
        if (revoked.count !== 1) return null;
        const expiresAt = new Date(at.getTime() + REFRESH_TTL_SECONDS * 1000);
        await tx.refreshToken.create({ data: { userId: current.userId, familyId: current.familyId, tokenHash: sha256(nextToken), expiresAt } });
        return { user: current.user, expiresAt };
      });
      if (!rotated) throw new HttpError(401, 'Phiên đăng nhập đã hết hạn.', { code: 'UNAUTHENTICATED' });
      return {
        accessToken: makeAccessToken(rotated.user),
        refreshToken: nextToken,
        refreshExpiresAt: rotated.expiresAt,
        user: publicUser(rotated.user)
      };
    },

    async me(user) { return { user: publicUser(user) }; },

    async logout(rawToken) {
      if (typeof rawToken === 'string' && rawToken.length >= 40 && rawToken.length <= 80) {
        await db.refreshToken.updateMany({ where: { tokenHash: sha256(rawToken), revokedAt: null }, data: { revokedAt: now() } });
      }
      return { message: 'Đã đăng xuất.' };
    },

    async forgotPassword(input) {
      const email = normalizeEmail(input.email);
      if (!validEmail(email)) return { message: GENERIC_FORGOT_MESSAGE };
      const user = await db.user.findUnique({ where: { email }, select: { id: true, email: true, status: true } });
      if (!user || user.status !== 'ACTIVE') return { message: GENERIC_FORGOT_MESSAGE };
      const token = makeOpaqueToken(32);
      const at = now();
      await db.passwordReset.upsert({
        where: { userId: user.id },
        create: { userId: user.id, tokenHash: sha256(token), expiresAt: new Date(at.getTime() + RESET_TTL_MS) },
        update: { tokenHash: sha256(token), expiresAt: new Date(at.getTime() + RESET_TTL_MS), usedAt: null, createdAt: at }
      });
      try { await sendPasswordReset(user.email, token); }
      catch (error) { console.error('Password reset email delivery failed.', error?.name || 'Error', error?.code || ''); }
      return { message: GENERIC_FORGOT_MESSAGE };
    },

    async resetPassword(input) {
      const token = typeof input.token === 'string' ? input.token : '';
      const password = input.password;
      if (!validPassword(password)) throw new HttpError(400, 'Mật khẩu cần có ít nhất 12 ký tự và tối đa 128 byte.', { code: 'VALIDATION_FAILED' });
      if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) throw invalidResetToken();
      const tokenHash = sha256(token);
      const at = now();
      const existing = await db.passwordReset.findUnique({ where: { tokenHash } });
      if (!existing || existing.usedAt || existing.expiresAt <= at) throw invalidResetToken();
      const passwordHash = await hashPassword(password);
      let completed;
      try {
        completed = await db.$transaction(async (tx) => {
          const reset = await tx.passwordReset.findUnique({ where: { tokenHash } });
          const currentTime = now();
          if (!reset || reset.usedAt || reset.expiresAt <= currentTime) return false;
          const user = await tx.user.findUnique({ where: { id: reset.userId } });
          if (!user || user.status !== 'ACTIVE') return false;
          const used = await tx.passwordReset.updateMany({
            where: { id: reset.id, usedAt: null, expiresAt: { gt: currentTime } },
            data: { usedAt: currentTime }
          });
          if (used.count !== 1) return false;
          const updated = await tx.user.updateMany({
            where: { id: user.id, status: 'ACTIVE' },
            data: { passwordHash, authVersion: { increment: 1 } }
          });
          if (updated.count !== 1) throw new Error('RESET_TRANSACTION_ROLLBACK');
          await tx.refreshToken.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: currentTime } });
          return true;
        });
      } catch (error) {
        if (error?.message === 'RESET_TRANSACTION_ROLLBACK') throw invalidResetToken();
        throw error;
      }
      if (!completed) throw invalidResetToken();
      return { message: 'Mật khẩu đã được cập nhật. Hãy đăng nhập lại.' };
    },

    async recordLoginFailure(email, ip) { return recordLoginFailure(email, ip); },
    async isLoginLocked(email, ip) { return loginLockout(email, ip); }
  };
}

module.exports = { createAuthService, normalizeEmail, validEmail, validPassword, publicUser };
