const crypto = require('node:crypto');
const { verifyPassword, hashPassword } = require('./password');

const ACTIVATION_PURPOSE = 'ACTIVATION';
const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
const OTP_MAX_RESENDS = 5;
const OTP_LOCK_MS = 15 * 60 * 1000;
const OTP_ATTEMPTS_PER_LOCK = 5;
const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILURES = 10;
const LOGIN_LOCK_MS = 15 * 60 * 1000;

function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function requiredHmacSecret(variableName) {
  const secret = process.env[variableName];
  if (!secret || Buffer.byteLength(secret) < 32) {
    throw new Error(`${variableName} must contain at least 32 bytes.`);
  }
  return secret;
}

function otpDigest(challengeId, code) {
  return crypto.createHmac('sha256', requiredHmacSecret('OTP_HMAC_SECRET'))
    .update(`${challengeId}:${code}`)
    .digest('hex');
}

function loginKeyHash(keyType, value) {
  return crypto.createHmac('sha256', requiredHmacSecret('LOGIN_COUNTER_HMAC_SECRET'))
    .update(`${keyType}:${value}`)
    .digest('hex');
}

function makeOtp() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

function hashResetToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function safeDigestMatch(expectedHex, actualHex) {
  const expected = Buffer.from(expectedHex, 'hex');
  const actual = Buffer.from(actualHex, 'hex');
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function publicBaseUrl(configuredValue = process.env.PUBLIC_BASE_URL) {
  const value = configuredValue;
  if (!value) throw new Error('PUBLIC_BASE_URL is not configured.');
  const parsed = new URL(value);
  if (parsed.protocol !== 'https:' && process.env.NODE_ENV === 'production') {
    throw new Error('PUBLIC_BASE_URL must use HTTPS in production.');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('PUBLIC_BASE_URL must use HTTP or HTTPS.');
  return parsed.origin;
}

async function sendEmail({ to, subject, text, html, kind }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) throw new Error('Email delivery is not configured.');

  let response;
  try {
    console.info('[auth] sending email through Resend', { kind });
    response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ from, to: [to], subject, text, html }),
      signal: AbortSignal.timeout(10000)
    });
  } catch {
    const error = new Error('Email delivery is temporarily unavailable.');
    error.code = 'EMAIL_PROVIDER_NETWORK';
    throw error;
  }
  if (!response.ok) {
    const error = new Error('Email delivery is temporarily unavailable.');
    error.code = `EMAIL_PROVIDER_HTTP_${response.status}`;
    throw error;
  }
  console.info('[auth] Resend accepted email', { kind });
}

async function sendActivationEmail(email, code) {
  const text = `Mã kích hoạt tài khoản Bếp Hội của bạn là ${code}. Mã có hiệu lực trong 10 phút. Nếu bạn không đăng ký, hãy bỏ qua email này.`;
  await sendEmail({
    kind: 'activation',
    to: email,
    subject: 'Mã kích hoạt tài khoản Bếp Hội',
    text,
    html: `<p>Mã kích hoạt tài khoản Bếp Hội của bạn:</p><p style="font-size:28px;font-weight:700;letter-spacing:8px">${code}</p><p>Mã có hiệu lực trong 10 phút. Nếu bạn không đăng ký, hãy bỏ qua email này.</p>`
  });
}

async function sendPasswordResetEmail(email, token, options = {}) {
  const url = new URL(options.path || '/password-reset/confirm', publicBaseUrl(options.baseUrl));
  if (options.tokenInFragment) url.hash = new URLSearchParams({ token }).toString();
  else url.searchParams.set('token', token);
  const link = url.toString();
  const text = `Đặt lại mật khẩu bằng liên kết này: ${link}\nLiên kết hết hạn sau 30 phút. Nếu bạn không yêu cầu, hãy bỏ qua email này.`;
  await sendEmail({
    kind: 'password_reset',
    to: email,
    subject: 'Đặt lại mật khẩu Bếp Hội',
    text,
    html: `<p>Đặt lại mật khẩu bằng liên kết sau. Liên kết có hiệu lực trong 30 phút:</p><p><a href="${link}">Đặt lại mật khẩu</a></p><p>Nếu bạn không yêu cầu, hãy bỏ qua email này.</p>`
  });
}

function isOtpLocked(challenge, now) {
  return Boolean(challenge.lockedUntil && challenge.lockedUntil > now);
}

function loginCounterKeys(emailValue, ipValue) {
  const email = normalizeEmail(emailValue) || '<invalid-email>';
  const ip = typeof ipValue === 'string' && ipValue ? ipValue : '<unknown-ip>';
  return [
    { keyType: 'EMAIL', keyHash: loginKeyHash('EMAIL', email) },
    { keyType: 'IP', keyHash: loginKeyHash('IP', ip) }
  ];
}

async function revokeUserSessions(tx, userId, now = new Date(), reason = 'ACCOUNT_DEACTIVATED') {
  if (tx.session && typeof tx.session.deleteMany === 'function') {
    await tx.session.deleteMany({ where: { userId } });
  }
  if (tx.authSession && typeof tx.authSession.updateMany === 'function') {
    await tx.authSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: now, revokeReason: reason }
    });
  } else if (typeof tx.$executeRaw === 'function') {
    // The legacy SSR Prisma client predates AuthSession. Use SQL so a password
    // reset there also revokes SPA sessions once the additive table exists.
    try {
      await tx.$executeRaw`
        UPDATE "AuthSession"
        SET "revokedAt" = ${now}, "revokeReason" = ${reason}
        WHERE "userId" = ${userId}::uuid AND "revokedAt" IS NULL
      `;
    } catch (error) {
      const databaseCode = error?.meta?.code
        || error?.cause?.code
        || error?.meta?.driverAdapterError?.cause?.originalCode
        || error?.code;
      const missingTable = databaseCode === '42P01'
        || error?.code === 'P2021'
        || /relation ["']?AuthSession["']? does not exist/i.test(error?.message || '');
      if (!missingTable) throw error;
    }
  }
}

function createAuthService(db, options = {}) {
  async function incrementLoginCounter(key, now) {
    const unique = { keyType_keyHash: key };
    const current = await db.loginFailureCounter.findUnique({ where: unique });
    if (!current) {
      try {
        await db.loginFailureCounter.create({
          data: { ...key, failureCount: 1, windowStartedAt: now, updatedAt: now }
        });
        return;
      } catch (error) {
        if (!error || error.code !== 'P2002') throw error;
        return incrementLoginCounter(key, now);
      }
    }

    if (now.getTime() - current.windowStartedAt.getTime() >= LOGIN_WINDOW_MS) {
      const reset = await db.loginFailureCounter.updateMany({
        where: { id: current.id, windowStartedAt: current.windowStartedAt },
        data: { failureCount: 1, windowStartedAt: now, lockedUntil: null, updatedAt: now }
      });
      if (reset.count) return;
      return incrementLoginCounter(key, now);
    }

    const nextCount = current.failureCount + 1;
    const data = {
      failureCount: { increment: 1 },
      updatedAt: now
    };
    if (nextCount >= LOGIN_MAX_FAILURES) data.lockedUntil = new Date(now.getTime() + LOGIN_LOCK_MS);
    const incremented = await db.loginFailureCounter.updateMany({
      where: { id: current.id, windowStartedAt: current.windowStartedAt },
      data
    });
    if (!incremented.count) return incrementLoginCounter(key, now);
  }

  return {
    async beginRegistration({ email: rawEmail, passwordHash }) {
      const email = normalizeEmail(rawEmail);
      if (typeof passwordHash !== 'string' || !passwordHash.startsWith('scrypt$')) {
        throw new Error('A scrypt password hash is required.');
      }

      const existingUser = await db.user.findUnique({ where: { email }, select: { id: true, status: true } });
      if (existingUser) return { userId: existingUser.status === 'PENDING' ? existingUser.id : null, created: false };

      const now = new Date();
      const challengeId = crypto.randomUUID();
      const code = makeOtp();
      let user;
      try {
        user = await db.$transaction(async (tx) => {
          const existing = await tx.user.findUnique({ where: { email }, select: { id: true, status: true } });
          if (existing) return existing.status === 'PENDING' ? existing : null;
          const pendingUser = await tx.user.create({
            data: { email, passwordHash, role: 'viewer', status: 'PENDING' },
            select: { id: true, email: true, status: true }
          });
          await tx.activationChallenge.create({
            data: {
              id: challengeId,
              userId: pendingUser.id,
              purpose: ACTIVATION_PURPOSE,
              otpHash: otpDigest(challengeId, code),
              expiresAt: new Date(now.getTime() + OTP_TTL_MS),
              lastSentAt: now
            }
          });
          return pendingUser;
        });
      } catch (error) {
        if (error && error.code === 'P2002') {
          const winner = await db.user.findUnique({ where: { email }, select: { id: true, status: true } });
          return { userId: winner && winner.status === 'PENDING' ? winner.id : null, created: false };
        }
        throw error;
      }

      if (!user) return { userId: null, created: false };
      if (user.id !== (await db.activationChallenge.findUnique({ where: { id: challengeId }, select: { userId: true } }))?.userId) {
        return { userId: user.id, created: false };
      }
      try {
        await sendActivationEmail(email, code);
        return { userId: user.id, created: true };
      } catch (error) {
        return { userId: user.id, created: true, deliveryErrorCode: error.code || 'EMAIL_PROVIDER_ERROR' };
      }
    },

    async resendActivationCode(userId) {
      const user = await db.user.findUnique({ where: { id: userId }, select: { id: true, email: true, status: true } });
      if (!user || user.status !== 'PENDING') return { status: 'unavailable' };

      const unique = { userId_purpose: { userId, purpose: ACTIVATION_PURPOSE } };
      const challenge = await db.activationChallenge.findUnique({ where: unique });
      const now = new Date();
      if (challenge && challenge.usedAt) return { status: 'unavailable' };
      if (challenge && isOtpLocked(challenge, now)) {
        return { status: 'locked', retryAfterSeconds: Math.ceil((challenge.lockedUntil.getTime() - now.getTime()) / 1000) };
      }
      if (challenge && challenge.resendCount >= OTP_MAX_RESENDS) return { status: 'limit' };
      if (challenge) {
        const retryAfterMs = challenge.lastSentAt.getTime() + OTP_RESEND_COOLDOWN_MS - now.getTime();
        if (retryAfterMs > 0) return { status: 'cooldown', retryAfterSeconds: Math.ceil(retryAfterMs / 1000) };
      }

      const code = makeOtp();
      const challengeId = challenge ? challenge.id : crypto.randomUUID();
      const nextExpiry = new Date(now.getTime() + OTP_TTL_MS);
      if (challenge) {
        const changed = await db.activationChallenge.updateMany({
          where: {
            id: challenge.id,
            lastSentAt: challenge.lastSentAt,
            usedAt: null,
            resendCount: { lt: OTP_MAX_RESENDS },
            OR: [{ lockedUntil: null }, { lockedUntil: { lte: now } }]
          },
          data: {
            otpHash: otpDigest(challenge.id, code),
            expiresAt: nextExpiry,
            lastSentAt: now,
            resendCount: { increment: 1 },
            lockedUntil: null
          }
        });
        if (!changed.count) return { status: 'cooldown', retryAfterSeconds: 60 };
      } else {
        await db.activationChallenge.create({
          data: {
            id: challengeId,
            userId,
            purpose: ACTIVATION_PURPOSE,
            otpHash: otpDigest(challengeId, code),
            expiresAt: nextExpiry,
            lastSentAt: now
          }
        });
      }

      await sendActivationEmail(user.email, code);
      return { status: 'sent' };
    },

    async resendActivationCodeByEmail(emailValue) {
      const email = normalizeEmail(emailValue);
      const user = await db.user.findUnique({ where: { email }, select: { id: true, status: true } });
      if (!user || user.status !== 'PENDING') return { status: 'unavailable' };
      return this.resendActivationCode(user.id);
    },

    async activateAccount(userId, submittedCode) {
      if (!/^\d{6}$/.test(submittedCode)) return { status: 'invalid' };
      const now = new Date();
      return db.$transaction(async (tx) => {
        const user = await tx.user.findUnique({ where: { id: userId }, select: { id: true, status: true, emailVerifiedAt: true } });
        if (!user || user.status !== 'PENDING') return { status: 'invalid' };
        const challenge = await tx.activationChallenge.findUnique({
          where: { userId_purpose: { userId, purpose: ACTIVATION_PURPOSE } }
        });
        if (!challenge || challenge.usedAt || challenge.expiresAt <= now) return { status: 'invalid' };
        if (isOtpLocked(challenge, now)) {
          return { status: 'locked', retryAfterSeconds: Math.ceil((challenge.lockedUntil.getTime() - now.getTime()) / 1000) };
        }

        const candidate = otpDigest(challenge.id, submittedCode);
        if (!safeDigestMatch(challenge.otpHash, candidate)) {
          const incremented = await tx.activationChallenge.updateMany({
            where: {
              id: challenge.id,
              otpHash: challenge.otpHash,
              usedAt: null,
              expiresAt: { gt: now },
              OR: [{ lockedUntil: null }, { lockedUntil: { lte: now } }]
            },
            data: { attempts: { increment: 1 } }
          });
          if (!incremented.count) return { status: 'invalid' };
          const updatedChallenge = await tx.activationChallenge.findUnique({
            where: { id: challenge.id }, select: { attempts: true }
          });
          const lockedUntil = updatedChallenge.attempts % OTP_ATTEMPTS_PER_LOCK === 0
            ? new Date(now.getTime() + OTP_LOCK_MS)
            : null;
          if (lockedUntil) {
            await tx.activationChallenge.updateMany({
              where: { id: challenge.id, otpHash: challenge.otpHash, attempts: updatedChallenge.attempts, usedAt: null },
              data: { lockedUntil }
            });
          }
          return { status: lockedUntil && lockedUntil > now ? 'locked' : 'invalid' };
        }

        const consumed = await tx.activationChallenge.updateMany({
          where: {
            id: challenge.id,
            otpHash: challenge.otpHash,
            usedAt: null,
            expiresAt: { gt: now },
            OR: [{ lockedUntil: null }, { lockedUntil: { lte: now } }]
          },
          data: { usedAt: now }
        });
        if (!consumed.count) return { status: 'invalid' };
        const activated = await tx.user.updateMany({
          where: { id: userId, status: 'PENDING' },
          data: { status: 'ACTIVE', emailVerifiedAt: now }
        });
        if (!activated.count) throw new Error('Account activation state changed concurrently.');
        return { status: 'activated' };
      });
    },

    async activateAccountByEmail(emailValue, submittedCode) {
      const email = normalizeEmail(emailValue);
      if (!email) return { status: 'invalid' };
      const user = await db.user.findUnique({ where: { email }, select: { id: true, status: true } });
      if (!user || user.status !== 'PENDING') return { status: 'invalid' };
      return this.activateAccount(user.id, submittedCode);
    },

    async authenticate(emailValue, password) {
      const email = normalizeEmail(emailValue);
      const user = await db.user.findUnique({ where: { email } });
      const passwordMatches = await verifyPassword(password, user && user.passwordHash);
      if (!user || user.status !== 'ACTIVE' || !user.emailVerifiedAt || !passwordMatches) return null;
      return { id: user.id, email: user.email, role: user.role, status: user.status };
    },

    async getLoginLockout(email, ip) {
      const keys = loginCounterKeys(email, ip);
      const counters = await db.loginFailureCounter.findMany({ where: { OR: keys } });
      const now = new Date();
      let retryAfterSeconds = 0;
      for (const counter of counters) {
        const windowExpiry = counter.windowStartedAt.getTime() + LOGIN_WINDOW_MS;
        const lockExpiry = counter.lockedUntil ? counter.lockedUntil.getTime() : 0;
        if (lockExpiry > now.getTime()) {
          retryAfterSeconds = Math.max(retryAfterSeconds, Math.ceil((lockExpiry - now.getTime()) / 1000));
        } else if (counter.failureCount >= LOGIN_MAX_FAILURES && windowExpiry > now.getTime()) {
          retryAfterSeconds = Math.max(retryAfterSeconds, Math.ceil((Math.max(windowExpiry, lockExpiry) - now.getTime()) / 1000));
        }
      }
      return retryAfterSeconds > 0 ? { locked: true, retryAfterSeconds } : { locked: false };
    },

    async recordLoginFailure(email, ip) {
      const now = new Date();
      for (const key of loginCounterKeys(email, ip)) await incrementLoginCounter(key, now);
    },

    async clearLoginFailures(email, ip) {
      const keys = loginCounterKeys(email, ip);
      await db.loginFailureCounter.deleteMany({ where: keys[0] });
    },

    async findById(id) {
      return db.user.findUnique({
        where: { id },
        select: { id: true, email: true, emailVerifiedAt: true, status: true, role: true }
      });
    },

    async requestPasswordReset(emailValue) {
      const email = normalizeEmail(emailValue);
      const user = await db.user.findUnique({ where: { email }, select: { id: true, email: true, status: true } });
      if (!user || user.status !== 'ACTIVE') return { queued: false };

      const token = crypto.randomBytes(32).toString('base64url');
      const tokenHash = hashResetToken(token);
      const now = new Date();
      await db.passwordReset.upsert({
        where: { userId: user.id },
        create: {
          userId: user.id,
          tokenHash,
          expiresAt: new Date(now.getTime() + PASSWORD_RESET_TTL_MS),
          createdAt: now
        },
        update: {
          tokenHash,
          expiresAt: new Date(now.getTime() + PASSWORD_RESET_TTL_MS),
          usedAt: null,
          createdAt: now
        }
      });
      await sendPasswordResetEmail(user.email, token, {
        baseUrl: options.publicBaseUrl,
        path: options.passwordResetPath,
        tokenInFragment: options.passwordResetTokenInFragment
      });
      return { queued: true };
    },

    async isPasswordResetTokenValid(token) {
      if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{40,60}$/.test(token)) return false;
      const reset = await db.passwordReset.findUnique({
        where: { tokenHash: hashResetToken(token) },
        include: { user: { select: { status: true } } }
      });
      return Boolean(reset && !reset.usedAt && reset.expiresAt > new Date() && reset.user.status === 'ACTIVE');
    },

    async completePasswordReset(token, password) {
      if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{40,60}$/.test(token)) return false;
      const tokenHash = hashResetToken(token);
      const initial = await db.passwordReset.findUnique({ where: { tokenHash } });
      const now = new Date();
      if (!initial || initial.usedAt || initial.expiresAt <= now) return false;
      const passwordHash = await hashPassword(password);
      return db.$transaction(async (tx) => {
        const reset = await tx.passwordReset.findUnique({ where: { tokenHash } });
        const currentTime = new Date();
        if (!reset || reset.usedAt || reset.expiresAt <= currentTime) return false;
        const user = await tx.user.findUnique({ where: { id: reset.userId }, select: { id: true, status: true } });
        if (!user || user.status !== 'ACTIVE') return false;
        await tx.user.update({ where: { id: user.id }, data: { passwordHash } });
        const used = await tx.passwordReset.updateMany({
          where: { id: reset.id, usedAt: null, expiresAt: { gt: currentTime } },
          data: { usedAt: currentTime }
        });
        if (!used.count) throw new Error('Password reset token was consumed concurrently.');
        await revokeUserSessions(tx, user.id, currentTime, 'PASSWORD_RESET');
        return true;
      });
    },

    async revokeAllSessionsForUser(userId, reason = 'ACCOUNT_DEACTIVATED') {
      const now = new Date();
      return db.$transaction(async (tx) => {
        await revokeUserSessions(tx, userId, now, reason);
        return true;
      });
    },

    async pruneExpiredAuthRecords() {
      const now = new Date();
      const pendingCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const resetCutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      await db.user.deleteMany({ where: { status: 'PENDING', createdAt: { lte: pendingCutoff } } });
      await db.passwordReset.deleteMany({ where: { OR: [{ expiresAt: { lte: resetCutoff } }, { usedAt: { lte: resetCutoff } }] } });
      await db.loginFailureCounter.deleteMany({ where: { updatedAt: { lte: resetCutoff } } });
      await db.activationChallenge.deleteMany({ where: { OR: [{ expiresAt: { lte: resetCutoff } }, { usedAt: { lte: resetCutoff } }] } });
    }
  };
}

module.exports = { createAuthService, normalizeEmail, revokeUserSessions };
