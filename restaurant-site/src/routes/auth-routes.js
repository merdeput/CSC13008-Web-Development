const crypto = require('node:crypto');
const express = require('express');
const rateLimit = require('express-rate-limit');
const asyncHandler = require('../lib/async-handler');
const { requireCsrf } = require('../middleware/csrf');
const { createAuthController } = require('../controllers/auth-controller');
const { normalizeEmail } = require('../services/auth-service');
const { ipKeyGenerator } = rateLimit;

function emailRateKey(req) {
  const email = normalizeEmail(req.body && req.body.email || req.session && req.session.pendingActivationEmail);
  if (!email) return `ip:${ipKeyGenerator(req.ip)}`;
  return `email:${crypto.createHash('sha256').update(email).digest('hex')}`;
}

function limit({ windowMs, limit: maxRequests, keyGenerator }) {
  return rateLimit({
    windowMs,
    limit: maxRequests,
    keyGenerator,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler(_req, res) {
      console.warn('[auth] request rate limited');
      return res.status(429).render('errors/error', {
        pageTitle: 'Hãy thử lại sau', status: 429,
        message: 'Đã đạt giới hạn yêu cầu. Vui lòng đợi một lúc rồi thử lại.'
      });
    }
  });
}

function createAuthRouter(services, options = {}) {
  const router = express.Router();
  const controller = createAuthController(services, options);
  const ipAuthLimiter = limit({ windowMs: 15 * 60 * 1000, limit: 20 });
  const emailOtpHourlyLimiter = limit({ windowMs: 60 * 60 * 1000, limit: 5, keyGenerator: emailRateKey });
  const emailOtpDailyLimiter = limit({ windowMs: 24 * 60 * 60 * 1000, limit: 10, keyGenerator: emailRateKey });

  router.get('/register', controller.showRegister);
  router.post('/register', (req, res, next) => {
    console.info('[auth] registration request received');
    next();
  }, ipAuthLimiter, emailOtpHourlyLimiter, emailOtpDailyLimiter, requireCsrf, asyncHandler(controller.beginRegistration));
  router.get('/activate', controller.showActivation);
  router.post('/activate', ipAuthLimiter, requireCsrf, asyncHandler(controller.activate));
  router.post('/activate/resend', ipAuthLimiter, emailOtpHourlyLimiter, emailOtpDailyLimiter, requireCsrf, asyncHandler(controller.resendActivation));
  router.get('/login', controller.showLogin);
  router.post('/login', ipAuthLimiter, requireCsrf, asyncHandler(controller.login));
  router.get('/password-reset', controller.showPasswordResetRequest);
  router.post('/password-reset', ipAuthLimiter, emailOtpHourlyLimiter, emailOtpDailyLimiter, requireCsrf, asyncHandler(controller.requestPasswordReset));
  router.get('/password-reset/confirm', asyncHandler(controller.showPasswordResetConfirm));
  router.post('/password-reset/confirm', ipAuthLimiter, requireCsrf, asyncHandler(controller.completePasswordReset));
  router.post('/logout', requireCsrf, controller.logout);
  return router;
}

module.exports = { createAuthRouter };
