const { normalizeEmail } = require('../../../../shared/auth/auth-service');
const { hashPassword } = require('../../../../shared/auth/password');
const { isRecaptchaConfigured, verifyRecaptcha } = require('../../../../shared/auth/recaptcha');
const {
  registrationAvailable, loginAvailable, passwordResetAvailable, validEmail, validPassword
} = require('../../../../shared/auth/policy');
const { getCookieNames, parseCookies, setRefreshCookie, setCsrfCookie, clearRefreshCookie, clearAuthCookies } = require('../lib/auth-cookies');
const { createCsrfToken } = require('../middleware/csrf');
const { signAccessToken } = require('../lib/access-token-signer');
const { verifyAccessToken } = require('../lib/access-token-verifier');

function ok(res, data, status = 200) {
  return res.status(status).json({ ok: true, data });
}

function fail(res, status, code, message, fields) {
  const error = { code, message };
  if (fields) error.fields = fields;
  return res.status(status).json({ ok: false, error });
}

function logFailure(event, error) {
  console.error(`[auth] ${event} failed`, { name: error && error.name, code: error && error.code });
}

function createAuthHandlers({ services, tokenSessions, mfa, jwtConfig, csrfSecret, verifyCaptcha = verifyRecaptcha, secureCookies }) {
  function issueCsrf(res) {
    const token = createCsrfToken(csrfSecret);
    setCsrfCookie(res, token, secureCookies);
    return token;
  }

  async function checkCaptcha(token, event) {
    if (!verifyCaptcha || typeof verifyCaptcha !== 'function') return { ok: false, unavailable: true };
    if (!isRecaptchaConfigured()) return { ok: false, unavailable: true };
    try {
      return { ok: Boolean(await verifyCaptcha(token)) };
    } catch (error) {
      logFailure(`${event} CAPTCHA verification`, error);
      return { ok: false, unavailable: true };
    }
  }

  function mfaFailure(res, result) {
    if (result.status === 'locked') {
      const retryAfterSeconds = Math.max(1, Math.ceil((new Date(result.lockedUntil).getTime() - Date.now()) / 1000));
      res.set('Retry-After', String(retryAfterSeconds));
      res.set('Cache-Control', 'no-store');
      return res.status(429).json({ ok: false, error: { code: 'MFA_LOCKED', message: 'Too many invalid verification attempts. Try again later.', retryAfterSeconds } });
    }
    if (result.status === 'reauth_required') return fail(res, 401, 'REAUTH_REQUIRED', 'Enter your current password and a valid authenticator or recovery code.');
    if (result.status === 'not_enabled') return fail(res, 409, 'MFA_NOT_ENABLED', 'Multi-factor authentication is not enabled for this account.');
    if (result.status === 'expired') return fail(res, 400, 'MFA_SETUP_EXPIRED', 'The setup has expired. Start again to create a new authenticator secret.');
    if (result.status === 'unavailable') return fail(res, 503, 'AUTH_UNAVAILABLE', 'Multi-factor authentication is temporarily unavailable.');
    return fail(res, 400, 'INVALID_MFA_CODE', 'The verification code is invalid, expired, or already used.');
  }

  return {
    csrf(_req, res) {
      const csrfToken = issueCsrf(res);
      res.set('Cache-Control', 'no-store');
      return ok(res, { csrfToken });
    },

    async register(req, res) {
      const email = normalizeEmail(req.body && req.body.email);
      const password = typeof req.body?.password === 'string' ? req.body.password : '';
      if (!validEmail(email) || !validPassword(password)) {
        return fail(res, 400, 'VALIDATION_FAILED', 'Check the submitted email and password.', {
          email: validEmail(email) ? undefined : 'Enter a valid email address.',
          password: validPassword(password) ? undefined : 'Password must be 12 characters or more, no more than 128 bytes, and include an uppercase letter, a number, and a special character.'
        });
      }
      if (!registrationAvailable()) return fail(res, 503, 'AUTH_UNAVAILABLE', 'Registration is temporarily unavailable.');
      const captcha = await checkCaptcha(req.body.captchaToken, 'registration');
      if (captcha.unavailable) return fail(res, 503, 'AUTH_UNAVAILABLE', 'Registration is temporarily unavailable.');
      if (!captcha.ok) return fail(res, 400, 'CAPTCHA_REQUIRED', 'Complete the CAPTCHA and try again.');

      try {
        const passwordHash = await hashPassword(password);
        const result = await services.auth.beginRegistration({ email, passwordHash });
        if (result.deliveryErrorCode) logFailure('registration OTP email delivery', { name: 'Error', code: result.deliveryErrorCode });
        return ok(res, { message: 'If this address can be registered, check the inbox for an activation code.' }, 202);
      } catch (error) {
        logFailure('registration', error);
        return fail(res, 503, 'AUTH_UNAVAILABLE', 'Registration is temporarily unavailable.');
      }
    },

    async verifyOtp(req, res) {
      const email = normalizeEmail(req.body && req.body.email);
      const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
      if (!validEmail(email) || !/^\d{6}$/.test(code)) {
        return fail(res, 400, 'INVALID_OTP', 'The code is invalid, expired, or unavailable.');
      }
      try {
        const result = await services.auth.activateAccountByEmail(email, code);
        if (result.status === 'activated') return ok(res, { verified: true, loginRequired: true });
        if (result.status === 'locked') return fail(res, 429, 'OTP_LOCKED', 'The code is invalid, expired, or unavailable. Try again later.');
        return fail(res, 400, 'INVALID_OTP', 'The code is invalid, expired, or unavailable.');
      } catch (error) {
        logFailure('OTP verification', error);
        return fail(res, 503, 'AUTH_UNAVAILABLE', 'Email verification is temporarily unavailable.');
      }
    },

    async resendOtp(req, res) {
      const email = normalizeEmail(req.body && req.body.email);
      if (!validEmail(email)) return fail(res, 400, 'VALIDATION_FAILED', 'Enter a valid email address.');
      if (!registrationAvailable()) return fail(res, 503, 'AUTH_UNAVAILABLE', 'Activation resend is temporarily unavailable.');
      const captcha = await checkCaptcha(req.body.captchaToken, 'activation resend');
      if (captcha.unavailable) return fail(res, 503, 'AUTH_UNAVAILABLE', 'Activation resend is temporarily unavailable.');
      if (!captcha.ok) return fail(res, 400, 'CAPTCHA_REQUIRED', 'Complete the CAPTCHA and try again.');
      try {
        const result = await services.auth.resendActivationCodeByEmail(email);
        if (result.status === 'sent') return ok(res, { message: 'If activation is available, a code has been sent.' }, 202);
        if (result.status === 'cooldown' || result.status === 'locked' || result.status === 'limit' || result.status === 'unavailable') {
          return ok(res, { message: 'If activation is available, a code has been sent.' }, 202);
        }
        return ok(res, { message: 'If activation is available, a code has been sent.' }, 202);
      } catch (error) {
        logFailure('activation resend', error);
        return fail(res, 503, 'AUTH_UNAVAILABLE', 'Activation resend is temporarily unavailable.');
      }
    },

    async login(req, res) {
      const email = normalizeEmail(req.body && req.body.email);
      const password = typeof req.body?.password === 'string' ? req.body.password : '';
      if (!loginAvailable()) return fail(res, 503, 'AUTH_UNAVAILABLE', 'Login is temporarily unavailable.');
      const captcha = await checkCaptcha(req.body?.captchaToken, 'login');
      if (captcha.unavailable) return fail(res, 503, 'AUTH_UNAVAILABLE', 'Login is temporarily unavailable.');
      if (!captcha.ok) return fail(res, 400, 'CAPTCHA_REQUIRED', 'Complete the CAPTCHA and try again.');

      try {
        const lockout = await services.auth.getLoginLockout(email, req.ip);
        if (lockout.locked) return fail(res, 429, 'LOGIN_LOCKED', 'Email or password is incorrect. Try again later.');
        if (!validEmail(email) || !password || Buffer.byteLength(password, 'utf8') > 128) {
          await services.auth.recordLoginFailure(email, req.ip);
          return fail(res, 401, 'LOGIN_INVALID', 'Email or password is incorrect.');
        }
        const user = await services.auth.authenticate(email, password);
        if (!user) {
          await services.auth.recordLoginFailure(email, req.ip);
          const nextLockout = await services.auth.getLoginLockout(email, req.ip);
          return fail(res, nextLockout.locked ? 429 : 401, nextLockout.locked ? 'LOGIN_LOCKED' : 'LOGIN_INVALID', 'Email or password is incorrect.');
        }

        await services.auth.clearLoginFailures(email, req.ip);
        const mfaStatus = await mfa.status(user.id);
        if (mfaStatus.enabled) {
          const pendingSession = await tokenSessions.createPendingSession(user.id);
          const pendingToken = signAccessToken({ userId: user.id, sessionId: pendingSession.sessionId, stage: 'mfa_pending' }, jwtConfig);
          if (parseCookies(req.headers.cookie).has(getCookieNames(secureCookies).refresh)) clearRefreshCookie(res, secureCookies);
          res.set('Cache-Control', 'no-store');
          return ok(res, { mfaRequired: true, pendingToken, expiresIn: 300 });
        }
        const session = await tokenSessions.createSession(user.id);
        const accessToken = signAccessToken({ userId: user.id, sessionId: session.sessionId }, jwtConfig);
        setRefreshCookie(res, session.refreshToken, session.expiresAt, secureCookies);
        res.set('Cache-Control', 'no-store');
        return ok(res, {
          accessToken,
          expiresIn: jwtConfig.accessTtlSeconds,
          user: { id: user.id, email: user.email, role: user.role, chefId: user.chefId }
        });
      } catch (error) {
        logFailure('login', error);
        return fail(res, 503, 'AUTH_UNAVAILABLE', 'Login is temporarily unavailable.');
      }
    },

    async verifyMfaLogin(req, res) {
      const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
      if (!/^\d{6}$/.test(code) && !/^[A-Fa-f0-9\s-]{32,40}$/.test(code)) {
        return fail(res, 400, 'INVALID_MFA_CODE', 'Enter a six-digit authenticator code or a recovery code.');
      }
      try {
        const result = await mfa.verifyLogin({ userId: req.auth.user.id, code });
        if (result.status !== 'valid') return mfaFailure(res, result);
        const session = await tokenSessions.completePendingSession(req.auth.sessionId, req.auth.user.id);
        if (!session) return fail(res, 401, 'MFA_CHALLENGE_EXPIRED', 'The verification session has expired. Sign in again.');
        const accessToken = signAccessToken({ userId: session.user.id, sessionId: session.sessionId }, jwtConfig);
        setRefreshCookie(res, session.refreshToken, session.expiresAt, secureCookies);
        res.set('Cache-Control', 'no-store');
        return ok(res, {
          accessToken,
          expiresIn: jwtConfig.accessTtlSeconds,
          user: { id: session.user.id, email: session.user.email, role: session.user.role, chefId: session.user.chefId }
        });
      } catch (error) {
        logFailure('MFA login verification', error);
        return fail(res, 503, 'AUTH_UNAVAILABLE', 'Multi-factor authentication is temporarily unavailable.');
      }
    },

    async mfaStatus(req, res) {
      try {
        const status = await mfa.status(req.auth.user.id);
        res.set('Cache-Control', 'no-store');
        return ok(res, status);
      } catch (error) {
        logFailure('MFA status', error);
        return fail(res, 503, 'AUTH_UNAVAILABLE', 'Multi-factor authentication status is temporarily unavailable.');
      }
    },

    async beginMfaSetup(req, res) {
      try {
        const result = await mfa.beginSetup({ userId: req.auth.user.id, password: req.body?.password, code: req.body?.code });
        if (result.status !== 'started') return mfaFailure(res, result);
        res.set('Cache-Control', 'no-store');
        res.set('Pragma', 'no-cache');
        return ok(res, {
          secret: result.secret,
          otpauthUri: result.otpauthUri,
          qrCodeDataUrl: result.qrCodeDataUrl,
          expiresAt: result.expiresAt
        });
      } catch (error) {
        logFailure('MFA setup start', error);
        return fail(res, 503, 'AUTH_UNAVAILABLE', 'Multi-factor authentication setup is temporarily unavailable.');
      }
    },

    async confirmMfaSetup(req, res) {
      const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
      try {
        const result = await mfa.confirmSetup({ userId: req.auth.user.id, code });
        if (result.status !== 'enabled') return mfaFailure(res, result);
        res.set('Cache-Control', 'no-store');
        return ok(res, { enabled: true, recoveryCodes: result.recoveryCodes });
      } catch (error) {
        logFailure('MFA setup confirmation', error);
        return fail(res, 503, 'AUTH_UNAVAILABLE', 'Multi-factor authentication setup is temporarily unavailable.');
      }
    },

    async disableMfa(req, res) {
      try {
        const result = await mfa.disable({ userId: req.auth.user.id, password: req.body?.password, code: req.body?.code });
        if (result.status !== 'disabled') return mfaFailure(res, result);
        res.set('Cache-Control', 'no-store');
        return ok(res, { enabled: false });
      } catch (error) {
        logFailure('MFA disable', error);
        return fail(res, 503, 'AUTH_UNAVAILABLE', 'Multi-factor authentication could not be disabled.');
      }
    },

    async refreshMfaRecoveryCodes(req, res) {
      try {
        const result = await mfa.refreshRecoveryCodes({ userId: req.auth.user.id, password: req.body?.password, code: req.body?.code });
        if (result.status !== 'replaced') return mfaFailure(res, result);
        res.set('Cache-Control', 'no-store');
        return ok(res, { recoveryCodes: result.recoveryCodes });
      } catch (error) {
        logFailure('MFA recovery-code refresh', error);
        return fail(res, 503, 'AUTH_UNAVAILABLE', 'Recovery codes could not be replaced.');
      }
    },

    async refresh(req, res) {
      const cookieName = getCookieNames(secureCookies).refresh;
      const rawToken = parseCookies(req.headers.cookie).get(cookieName);
      let rotationCompleted = false;
      try {
        const result = await tokenSessions.rotate(rawToken);
        if (result.status !== 'rotated') {
          clearAuthCookies(res, secureCookies);
          return fail(res, 401, result.status === 'reuse' ? 'REFRESH_REUSE' : 'REFRESH_INVALID', 'The refresh session is invalid. Sign in again.');
        }
        rotationCompleted = true;
        const accessToken = signAccessToken({ userId: result.user.id, sessionId: result.sessionId }, jwtConfig);
        setRefreshCookie(res, result.refreshToken, result.expiresAt, secureCookies);
        const csrfToken = issueCsrf(res);
        res.set('Cache-Control', 'no-store');
        return ok(res, { accessToken, expiresIn: jwtConfig.accessTtlSeconds, csrfToken });
      } catch (error) {
        logFailure('refresh', error);
        // After a completed rotation, the original cookie cannot be retried.
        if (rotationCompleted) clearAuthCookies(res, secureCookies);
        return fail(res, 503, 'AUTH_UNAVAILABLE', 'Session refresh is temporarily unavailable.');
      }
    },

    async me(req, res) {
      res.set('Cache-Control', 'no-store');
      return ok(res, { id: req.auth.user.id, email: req.auth.user.email, role: req.auth.user.role, chefId: req.auth.user.chefId });
    },

    async logout(req, res) {
      const authorization = req.get('Authorization');
      const match = typeof authorization === 'string' && /^Bearer ([A-Za-z0-9._-]+)$/.exec(authorization);
      const claims = match ? verifyAccessToken(match[1], jwtConfig) : null;
      const cookieName = getCookieNames(secureCookies).refresh;
      const rawRefresh = parseCookies(req.headers.cookie).get(cookieName);
      try {
        const sessionId = rawRefresh ? await tokenSessions.findSessionForRefreshToken(rawRefresh) : null;
        if (sessionId) await tokenSessions.revokeSession(sessionId, 'LOGOUT');
      } catch (error) {
        logFailure('logout', error);
        return fail(res, 503, 'AUTH_UNAVAILABLE', 'Logout is temporarily unavailable.');
      }
      clearAuthCookies(res, secureCookies);
      return res.status(204).end();
    },

    async requestPasswordReset(req, res) {
      const email = normalizeEmail(req.body && req.body.email);
      if (!passwordResetAvailable()) return fail(res, 503, 'AUTH_UNAVAILABLE', 'Password recovery is temporarily unavailable.');
      const captcha = await checkCaptcha(req.body?.captchaToken, 'password reset');
      if (captcha.unavailable) return fail(res, 503, 'AUTH_UNAVAILABLE', 'Password recovery is temporarily unavailable.');
      if (!captcha.ok) return fail(res, 400, 'CAPTCHA_REQUIRED', 'Complete the CAPTCHA and try again.');
      try {
        if (validEmail(email)) await services.auth.requestPasswordReset(email);
      } catch (error) {
        logFailure('password reset request', error);
      }
      return ok(res, { message: 'If an active account matches, password recovery instructions have been sent.' }, 202);
    },

    async completePasswordReset(req, res) {
      const token = typeof req.body?.token === 'string' ? req.body.token : '';
      const password = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';
      if (!validPassword(password)) return fail(res, 400, 'VALIDATION_FAILED', 'Password must be 12 characters or more, no more than 128 bytes, and include an uppercase letter, a number, and a special character.');
      try {
        const completed = await services.auth.completePasswordReset(token, password);
        if (!completed) return fail(res, 400, 'INVALID_RESET_TOKEN', 'The reset link is invalid, expired, or unavailable.');
        return ok(res, { reset: true, loginRequired: true });
      } catch (error) {
        logFailure('password reset completion', error);
        return fail(res, 503, 'AUTH_UNAVAILABLE', 'Password recovery is temporarily unavailable.');
      }
    }
  };
}

module.exports = { createAuthHandlers, ok, fail };
