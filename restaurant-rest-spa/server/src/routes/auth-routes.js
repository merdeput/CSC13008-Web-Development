const crypto = require('node:crypto');
const express = require('express');
const rateLimit = require('express-rate-limit');
const asyncHandler = require('../lib/async-handler');
const { normalizeEmail } = require('../../../../shared/auth/auth-service');
const { createAuthHandlers } = require('../handlers/auth-handlers');
const { requireCookieSession } = require('../middleware/require-cookie-session');
const { requirePendingMfaToken } = require('../middleware/require-access-token');

function createLimiter({ windowMs, limit: maxRequests, keyGenerator, message = 'Too many requests. Try again later.' }) {
  return rateLimit({
    windowMs,
    limit: maxRequests,
    keyGenerator,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler(_req, res) {
      return res.status(429).json({ ok: false, error: { code: 'RATE_LIMITED', message } });
    }
  });
}

function emailKeyGenerator(req) {
  const email = normalizeEmail(req.body && req.body.email);
  return email
    ? `email:${crypto.createHash('sha256').update(email).digest('hex')}`
    : `ip:${rateLimit.ipKeyGenerator(req.ip)}`;
}

function createAuthRouter({ services, tokenSessions, mfa, jwtConfig, csrfSecret, csrfMiddleware, secureCookies, verifyCaptcha, limits = {} }) {
  const router = express.Router();
  const handlers = createAuthHandlers({ services, tokenSessions, mfa, jwtConfig, csrfSecret, secureCookies, verifyCaptcha });
  const ipAuthLimiter = createLimiter({ windowMs: 15 * 60 * 1000, limit: limits.ipAuth || 20 });
  const refreshLimiter = createLimiter({ windowMs: 60 * 1000, limit: limits.refresh || 30 });
  const mfaLimiter = createLimiter({ windowMs: 15 * 60 * 1000, limit: limits.mfa || 10 });
  const emailHourlyLimiter = createLimiter({ windowMs: 60 * 60 * 1000, limit: limits.emailHourly || 5, keyGenerator: emailKeyGenerator });
  const emailDailyLimiter = createLimiter({ windowMs: 24 * 60 * 60 * 1000, limit: limits.emailDaily || 10, keyGenerator: emailKeyGenerator });
  const { requireTrustedOrigin, requireCsrf } = csrfMiddleware;
  const requireAuthenticated = requireCookieSession({ tokenSessions, secureCookies });
  const requirePendingMfa = requirePendingMfaToken({ jwtConfig, tokenSessions });

  router.get('/csrf', handlers.csrf);
  router.post('/register', ipAuthLimiter, emailHourlyLimiter, emailDailyLimiter, requireTrustedOrigin, requireCsrf, asyncHandler(handlers.register));
  router.post('/verify-otp', ipAuthLimiter, requireTrustedOrigin, requireCsrf, asyncHandler(handlers.verifyOtp));
  router.post('/resend-otp', ipAuthLimiter, emailHourlyLimiter, emailDailyLimiter, requireTrustedOrigin, requireCsrf, asyncHandler(handlers.resendOtp));
  router.post('/login', ipAuthLimiter, requireTrustedOrigin, requireCsrf, asyncHandler(handlers.login));
  router.post('/mfa/verify-login', mfaLimiter, requireTrustedOrigin, requireCsrf, requirePendingMfa, asyncHandler(handlers.verifyMfaLogin));
  router.get('/mfa/status', requireAuthenticated, asyncHandler(handlers.mfaStatus));
  router.post('/mfa/setup', mfaLimiter, requireTrustedOrigin, requireCsrf, requireAuthenticated, asyncHandler(handlers.beginMfaSetup));
  router.post('/mfa/confirm-setup', mfaLimiter, requireTrustedOrigin, requireCsrf, requireAuthenticated, asyncHandler(handlers.confirmMfaSetup));
  router.post('/mfa/disable', mfaLimiter, requireTrustedOrigin, requireCsrf, requireAuthenticated, asyncHandler(handlers.disableMfa));
  router.post('/mfa/recovery-codes', mfaLimiter, requireTrustedOrigin, requireCsrf, requireAuthenticated, asyncHandler(handlers.refreshMfaRecoveryCodes));
  router.post('/refresh', refreshLimiter, requireTrustedOrigin, requireCsrf, asyncHandler(handlers.refresh));
  router.get('/me', requireAuthenticated, asyncHandler(handlers.me));
  router.post('/logout', ipAuthLimiter, requireTrustedOrigin, requireCsrf, asyncHandler(handlers.logout));
  router.post('/password-reset', ipAuthLimiter, emailHourlyLimiter, emailDailyLimiter, requireTrustedOrigin, requireCsrf, asyncHandler(handlers.requestPasswordReset));
  router.post('/password-reset/confirm', ipAuthLimiter, requireTrustedOrigin, requireCsrf, asyncHandler(handlers.completePasswordReset));
  return router;
}

module.exports = { createAuthRouter, createLimiter, emailKeyGenerator };
