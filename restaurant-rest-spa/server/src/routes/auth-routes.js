const express = require('express');
const rateLimit = require('express-rate-limit');
const asyncHandler = require('../lib/async-handler');
const { HttpError } = require('../lib/errors');
const { verifyRecaptcha } = require('../lib/recaptcha');
const { requireAccessToken } = require('../middleware/authentication');
const { issueCsrf, requireCsrf, readCookie, setRefreshCookie, clearAuthCookies, REFRESH_COOKIE } = require('../middleware/csrf');

function limiter({ windowMs, limit, message = 'Đã đạt giới hạn yêu cầu. Vui lòng thử lại sau.' }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler(_req, res) {
      return res.status(429).json({ ok: false, error: { code: 'RATE_LIMITED', message } });
    }
  });
}

function createAuthRouter(authService, db, options = {}) {
  const router = express.Router();
  const verifyCaptcha = options.verifyRecaptcha || verifyRecaptcha;
  const limits = options.limits || {};
  const registerLimit = limiter({ windowMs: 15 * 60 * 1000, limit: limits.register || 10 });
  const loginLimit = limiter({ windowMs: 15 * 60 * 1000, limit: limits.login || 20 });
  const otpLimit = limiter({ windowMs: 60 * 60 * 1000, limit: limits.otp || 10 });
  const forgotLimit = limiter({ windowMs: 60 * 60 * 1000, limit: limits.forgot || 5 });
  const resetLimit = limiter({ windowMs: 15 * 60 * 1000, limit: limits.reset || 10 });
  const requireAuth = requireAccessToken(db, options);

  async function captchaOrReject(req) {
    const token = req.body?.recaptchaToken || req.body?.captchaToken || req.body?.['g-recaptcha-response'];
    if (typeof token !== 'string' || !token.trim()) {
      throw new HttpError(400, 'Hãy hoàn tất reCAPTCHA trước khi gửi yêu cầu.', { code: 'CAPTCHA_REQUIRED' });
    }
    const accepted = await verifyCaptcha(token, { remoteIp: req.ip });
    if (!accepted) throw new HttpError(400, 'reCAPTCHA không hợp lệ. Vui lòng thử lại.', { code: 'CAPTCHA_REQUIRED' });
  }

  router.get('/csrf', issueCsrf);
  router.post('/register', registerLimit, requireCsrf, asyncHandler(async (req, res) => {
    await captchaOrReject(req);
    const result = await authService.register(req.body || {});
    res.set('Cache-Control', 'no-store');
    return res.status(200).json({ ok: true, data: result });
  }));
  router.post('/verify-email', otpLimit, requireCsrf, asyncHandler(async (req, res) => {
    const result = await authService.verifyEmail(req.body || {});
    res.set('Cache-Control', 'no-store');
    return res.json({ ok: true, data: result });
  }));
  router.post('/resend-otp', otpLimit, requireCsrf, asyncHandler(async (req, res) => {
    await captchaOrReject(req);
    const result = await authService.resendOtp(req.body || {});
    res.set('Cache-Control', 'no-store');
    return res.json({ ok: true, data: result });
  }));
  router.post('/login', loginLimit, requireCsrf, asyncHandler(async (req, res) => {
    await captchaOrReject(req);
    const result = await authService.login(req.body || {}, req.ip);
    const { refreshToken, refreshExpiresAt, ...publicResult } = result;
    const ttlSeconds = Math.max(0, Math.floor((refreshExpiresAt.getTime() - Date.now()) / 1000));
    setRefreshCookie(res, refreshToken, ttlSeconds);
    res.set('Cache-Control', 'no-store');
    return res.json({ ok: true, data: publicResult });
  }));
  router.post('/forgot-password', forgotLimit, requireCsrf, asyncHandler(async (req, res) => {
    await captchaOrReject(req);
    const result = await authService.forgotPassword(req.body || {});
    res.set('Cache-Control', 'no-store');
    return res.json({ ok: true, data: result });
  }));
  router.post('/reset-password', resetLimit, requireCsrf, asyncHandler(async (req, res) => {
    const result = await authService.resetPassword(req.body || {});
    res.set('Cache-Control', 'no-store');
    return res.json({ ok: true, data: result });
  }));
  router.post('/refresh', requireCsrf, asyncHandler(async (req, res) => {
    let result;
    try { result = await authService.refresh(readCookie(req, REFRESH_COOKIE)); }
    catch (error) {
      if (error?.status === 401) clearAuthCookies(res);
      throw error;
    }
    const { refreshToken, refreshExpiresAt, ...publicResult } = result;
    const ttlSeconds = Math.max(0, Math.floor((refreshExpiresAt.getTime() - Date.now()) / 1000));
    setRefreshCookie(res, refreshToken, ttlSeconds);
    res.set('Cache-Control', 'no-store');
    return res.json({ ok: true, data: publicResult });
  }));
  router.get('/me', requireAuth, asyncHandler(async (req, res) => {
    res.set('Cache-Control', 'no-store');
    return res.json({ ok: true, data: await authService.me(req.authUser) });
  }));
  router.post('/logout', requireCsrf, asyncHandler(async (req, res) => {
    const result = await authService.logout(readCookie(req, REFRESH_COOKIE));
    clearAuthCookies(res);
    res.set('Cache-Control', 'no-store');
    return res.json({ ok: true, data: result });
  }));

  return router;
}

module.exports = { createAuthRouter, limiter };
