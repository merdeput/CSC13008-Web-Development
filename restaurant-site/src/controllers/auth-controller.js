const { normalizeEmail } = require('../services/auth-service');
const { isRecaptchaConfigured, verifyRecaptcha } = require('../lib/recaptcha');
const { hashPassword } = require('../lib/password');
const { registrationAvailable, loginAvailable, passwordResetAvailable, validEmail, validPassword } = require('../../../shared/auth/policy');

const IDLE_TIMEOUT_MS = 4 * 60 * 60 * 1000;
const ABSOLUTE_TIMEOUT_MS = 12 * 60 * 60 * 1000;

function captchaSiteKey() {
  return process.env.RECAPTCHA_SITE_KEY || '';
}

function logAuthFailure(event, error) {
  console.error(`[auth] ${event} failed`, {
    name: error && error.name,
    code: error && error.code
  });
}

function safeReturnTo(value) {
  if (typeof value !== 'string' || !(value === '/admin' || value.startsWith('/admin/')) || value.startsWith('//') || value.includes('\\')) return '/admin';
  return value;
}

function regenerateSession(req) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((error) => error ? reject(error) : resolve());
  });
}

function saveSession(req) {
  return new Promise((resolve, reject) => {
    req.session.save((error) => error ? reject(error) : resolve());
  });
}

function renderRegister(res, status, { error = '', email = '' } = {}) {
  return res.status(status).render('auth/register', {
    pageTitle: 'Tạo tài khoản — Bếp Hội',
    error,
    email,
    captchaSiteKey: captchaSiteKey(),
    registrationAvailable: registrationAvailable()
  });
}

function renderActivation(res, status, message, error = '') {
  return res.status(status).render('auth/activate', {
    pageTitle: 'Kích hoạt tài khoản — Bếp Hội',
    message,
    error,
    captchaSiteKey: captchaSiteKey(),
    canActivate: true,
    registrationAvailable: registrationAvailable()
  });
}

function renderLogin(res, status, { error = '', email = '', returnTo = '/admin', notice = '' } = {}) {
  return res.status(status).render('auth/login', {
    pageTitle: 'Đăng nhập — Bếp Hội',
    error,
    email,
    returnTo,
    notice,
    captchaSiteKey: captchaSiteKey(),
    loginAvailable: loginAvailable()
  });
}

function createAuthController(services, options = {}) {
  const sessionCookieName = options.sessionCookieName || 'bephoi.sid';
  const verifyCaptcha = options.verifyRecaptcha || verifyRecaptcha;

  return {
    showRegister(req, res) {
      if (req.session.userId) return res.redirect(303, '/admin');
      return renderRegister(res, registrationAvailable() ? 200 : 503, {
        error: registrationAvailable() ? '' : 'Đăng ký đang tạm thời chưa khả dụng. Vui lòng thử lại sau.'
      });
    },

    async beginRegistration(req, res) {
      const email = normalizeEmail(req.body.email);
      const password = typeof req.body.password === 'string' ? req.body.password : '';
      if (!validEmail(email)) {
        console.warn('[auth] registration blocked before email delivery', { stage: 'email_validation' });
        return renderRegister(res, 400, { email, error: 'Nhập địa chỉ email hợp lệ.' });
      }
      if (!validPassword(password)) {
        console.warn('[auth] registration blocked before email delivery', { stage: 'password_validation' });
        return renderRegister(res, 400, { email, error: 'Mật khẩu cần có ít nhất 12 ký tự, tối đa 128 byte, một chữ hoa, một chữ số và một ký tự đặc biệt.' });
      }
      if (!registrationAvailable()) {
        console.warn('[auth] registration blocked before email delivery', { stage: 'configuration' });
        return renderRegister(res, 503, { email, error: 'Đăng ký đang tạm thời chưa khả dụng. Vui lòng thử lại sau.' });
      }

      let captchaOk;
      try {
        captchaOk = await verifyCaptcha(req.body['g-recaptcha-response']);
      } catch (error) {
        logAuthFailure('registration CAPTCHA verification', error);
        return renderRegister(res, 503, { email, error: 'Không thể xác minh reCAPTCHA lúc này. Vui lòng thử lại.' });
      }
      if (!captchaOk) {
        console.warn('[auth] registration blocked before email delivery', { stage: 'captcha_rejected' });
        return renderRegister(res, 400, { email, error: 'Hãy hoàn tất reCAPTCHA rồi gửi lại biểu mẫu.' });
      }

      try {
        delete req.session.pendingActivationUserId;
        delete req.session.pendingActivationEmail;
        const passwordHash = await hashPassword(password);
        const result = await services.auth.beginRegistration({ email, passwordHash });
        if (result.userId) req.session.pendingActivationUserId = result.userId;
        req.session.pendingActivationEmail = email;
        if (!result.created) {
          console.info('[auth] registration OTP skipped', { reason: 'account_already_exists' });
        }
        if (result.deliveryErrorCode) {
          logAuthFailure('registration OTP request', { name: 'Error', code: result.deliveryErrorCode });
        }
      } catch (error) {
        logAuthFailure('registration OTP request', error);
        return renderRegister(res, 503, { email, error: 'Không thể gửi mã kích hoạt lúc này. Vui lòng thử lại sau.' });
      }
      return renderActivation(res, 200, 'Nếu địa chỉ email có thể đăng ký, hãy kiểm tra hộp thư để lấy mã kích hoạt. Nếu đã có tài khoản, hãy đăng nhập hoặc đặt lại mật khẩu.');
    },

    showActivation(req, res) {
      if (!req.session.pendingActivationUserId) return res.redirect(303, '/register');
      return renderActivation(res, 200, 'Nhập mã gồm 6 chữ số đã gửi đến email của bạn.');
    },

    async activate(req, res) {
      const userId = req.session.pendingActivationUserId;
      const code = typeof req.body.code === 'string' ? req.body.code.trim() : '';
      if (!userId) return renderActivation(res, 400, '', 'Mã không hợp lệ, đã hết hạn hoặc không thể sử dụng.');

      let result;
      try {
        result = await services.auth.activateAccount(userId, code);
      } catch (error) {
        logAuthFailure('account activation', error);
        return renderActivation(res, 503, '', 'Không thể kích hoạt tài khoản lúc này. Vui lòng thử lại.');
      }
      if (result.status === 'activated') {
        await regenerateSession(req);
        return res.redirect(303, '/login?activated=1');
      }
      if (result.status === 'locked') {
        return renderActivation(res, 429, '', 'Mã không hợp lệ, đã hết hạn hoặc không thể sử dụng. Vui lòng đợi rồi thử lại.');
      }
      return renderActivation(res, 400, '', 'Mã không hợp lệ, đã hết hạn hoặc không thể sử dụng.');
    },

    async resendActivation(req, res) {
      const userId = req.session.pendingActivationUserId;
      if (!userId) return res.redirect(303, '/register');
      if (!registrationAvailable()) return renderActivation(res, 503, '', 'Yêu cầu kích hoạt tạm thời chưa khả dụng. Vui lòng thử lại sau.');

      let captchaOk;
      try {
        captchaOk = await verifyCaptcha(req.body['g-recaptcha-response']);
      } catch (error) {
        logAuthFailure('activation resend CAPTCHA verification', error);
        return renderActivation(res, 503, '', 'Không thể xác minh reCAPTCHA lúc này. Vui lòng thử lại.');
      }
      if (!captchaOk) return renderActivation(res, 400, '', 'Hãy hoàn tất reCAPTCHA để gửi mã mới.');

      try {
        const result = await services.auth.resendActivationCode(userId);
        if (result.status === 'cooldown' || result.status === 'locked') {
          return renderActivation(res, 429, '', `Vui lòng đợi ${result.retryAfterSeconds || 60} giây rồi thử lại.`);
        }
        if (result.status === 'limit') return renderActivation(res, 429, '', 'Đã đạt giới hạn gửi mã. Vui lòng thử lại sau.');
        if (result.status === 'unavailable') return renderActivation(res, 400, '', 'Yêu cầu kích hoạt đã hết hạn. Hãy bắt đầu lại.');
        return renderActivation(res, 200, 'Nếu yêu cầu còn hiệu lực, mã mới đã được gửi đến email của bạn.');
      } catch (error) {
        logAuthFailure('activation email resend', error);
        return renderActivation(res, 503, '', 'Không thể gửi mã kích hoạt lúc này. Vui lòng thử lại sau.');
      }
    },

    showLogin(req, res) {
      if (req.session.userId) return res.redirect(303, '/admin');
      let notice = '';
      if (req.query.activated === '1') notice = 'Tài khoản đã được kích hoạt. Bạn có thể đăng nhập.';
      if (req.query.reset === '1') notice = 'Mật khẩu đã được cập nhật. Hãy đăng nhập bằng mật khẩu mới.';
      return renderLogin(res, loginAvailable() ? 200 : 503, {
        error: loginAvailable() ? '' : 'Đăng nhập tạm thời chưa khả dụng. Vui lòng thử lại sau.',
        email: '',
        returnTo: safeReturnTo(req.query.returnTo),
        notice
      });
    },

    async login(req, res) {
      const email = normalizeEmail(req.body.email);
      const password = typeof req.body.password === 'string' ? req.body.password : '';
      const returnTo = safeReturnTo(req.body.returnTo);
      const invalidMessage = 'Email hoặc mật khẩu không chính xác.';
      if (!loginAvailable()) return renderLogin(res, 503, { error: 'Đăng nhập tạm thời chưa khả dụng. Vui lòng thử lại sau.', email, returnTo });

      let captchaOk;
      try {
        captchaOk = await verifyCaptcha(req.body['g-recaptcha-response']);
      } catch (error) {
        logAuthFailure('login CAPTCHA verification', error);
        return renderLogin(res, 503, { error: 'Không thể xác minh reCAPTCHA lúc này. Vui lòng thử lại.', email, returnTo });
      }
      if (!captchaOk) return renderLogin(res, 400, { error: 'Hãy hoàn tất reCAPTCHA rồi gửi lại biểu mẫu.', email, returnTo });

      try {
        const lockout = await services.auth.getLoginLockout(email, req.ip);
        if (lockout.locked) {
          return renderLogin(res, 429, { error: 'Email hoặc mật khẩu không chính xác. Vui lòng đợi trước khi thử lại.', email, returnTo });
        }
        if (!validEmail(email) || !password || Buffer.byteLength(password, 'utf8') > 128) {
          await services.auth.recordLoginFailure(email, req.ip);
          return renderLogin(res, 401, { error: invalidMessage, email, returnTo });
        }

        const user = await services.auth.authenticate(email, password);
        if (!user) {
          await services.auth.recordLoginFailure(email, req.ip);
          const updatedLockout = await services.auth.getLoginLockout(email, req.ip);
          return renderLogin(res, updatedLockout.locked ? 429 : 401, {
            error: updatedLockout.locked ? 'Email hoặc mật khẩu không chính xác. Vui lòng đợi trước khi thử lại.' : invalidMessage,
            email,
            returnTo
          });
        }

        await services.auth.clearLoginFailures(email, req.ip);
        await regenerateSession(req);
        req.session.userId = user.id;
        req.session.email = user.email;
        req.session.role = user.role;
        req.session.authenticatedAt = Date.now();
        req.session.authExpiresAt = Date.now() + ABSOLUTE_TIMEOUT_MS;
        req.session.cookie.maxAge = IDLE_TIMEOUT_MS;
        await saveSession(req);
        return res.redirect(303, returnTo);
      } catch (error) {
        logAuthFailure('login', error);
        return renderLogin(res, 503, { error: 'Đăng nhập đang tạm thời chưa khả dụng. Vui lòng thử lại.', email, returnTo });
      }
    },

    showPasswordResetRequest(req, res) {
      return res.status(passwordResetAvailable() ? 200 : 503).render('auth/password-reset-request', {
        pageTitle: 'Quên mật khẩu — Bếp Hội',
        error: passwordResetAvailable() ? '' : 'Đặt lại mật khẩu tạm thời chưa khả dụng.',
        message: '',
        captchaSiteKey: captchaSiteKey(),
        available: passwordResetAvailable()
      });
    },

    async requestPasswordReset(req, res) {
      const email = normalizeEmail(req.body.email);
      if (!passwordResetAvailable() || !isRecaptchaConfigured()) {
        return res.status(503).render('auth/password-reset-request', {
          pageTitle: 'Quên mật khẩu — Bếp Hội',
          error: 'Đặt lại mật khẩu tạm thời chưa khả dụng.',
          message: '',
          captchaSiteKey: captchaSiteKey(),
          available: false
        });
      }
      let captchaOk;
      try {
        captchaOk = await verifyCaptcha(req.body['g-recaptcha-response']);
      } catch (error) {
        logAuthFailure('password reset CAPTCHA verification', error);
        return res.status(503).render('auth/password-reset-request', {
          pageTitle: 'Quên mật khẩu — Bếp Hội', error: 'Không thể xác minh reCAPTCHA lúc này.',
          message: '',
          captchaSiteKey: captchaSiteKey(), available: true
        });
      }
      if (!captchaOk) {
        return res.status(400).render('auth/password-reset-request', {
          pageTitle: 'Quên mật khẩu — Bếp Hội', error: 'Hãy hoàn tất reCAPTCHA rồi gửi lại biểu mẫu.',
          message: '',
          captchaSiteKey: captchaSiteKey(), available: true
        });
      }

      try {
        if (validEmail(email)) await services.auth.requestPasswordReset(email);
      } catch (error) {
        logAuthFailure('password reset request', error);
      }
      return res.render('auth/password-reset-request', {
        pageTitle: 'Kiểm tra email — Bếp Hội',
        error: '',
        message: 'Nếu email có tài khoản đang hoạt động, hướng dẫn đặt lại mật khẩu sẽ được gửi đến hộp thư đó.',
        captchaSiteKey: captchaSiteKey(),
        available: false
      });
    },

    async showPasswordResetConfirm(req, res) {
      res.set('Cache-Control', 'no-store');
      res.set('Referrer-Policy', 'no-referrer');
      const token = typeof req.query.token === 'string' ? req.query.token : '';
      let valid = false;
      try {
        valid = await services.auth.isPasswordResetTokenValid(token);
      } catch (error) {
        logAuthFailure('password reset token lookup', error);
      }
      return res.status(valid ? 200 : 400).render('auth/password-reset-confirm', {
        pageTitle: 'Tạo mật khẩu mới — Bếp Hội',
        error: valid ? '' : 'Liên kết không hợp lệ hoặc đã hết hạn. Hãy yêu cầu liên kết mới.',
        token,
        valid
      });
    },

    async completePasswordReset(req, res) {
      const token = typeof req.body.token === 'string' ? req.body.token : '';
      const password = typeof req.body.password === 'string' ? req.body.password : '';
      if (!validPassword(password)) {
        return res.status(400).render('auth/password-reset-confirm', {
          pageTitle: 'Tạo mật khẩu mới — Bếp Hội',
          error: 'Mật khẩu cần có ít nhất 12 ký tự, tối đa 128 byte, một chữ hoa, một chữ số và một ký tự đặc biệt.', token, valid: true
        });
      }
      try {
        const completed = await services.auth.completePasswordReset(token, password);
        if (!completed) {
          return res.status(400).render('auth/password-reset-confirm', {
            pageTitle: 'Tạo mật khẩu mới — Bếp Hội',
            error: 'Liên kết không hợp lệ hoặc đã hết hạn. Hãy yêu cầu liên kết mới.', token, valid: false
          });
        }
      } catch (error) {
        logAuthFailure('password reset completion', error);
        return res.status(503).render('auth/password-reset-confirm', {
          pageTitle: 'Tạo mật khẩu mới — Bếp Hội',
          error: 'Không thể cập nhật mật khẩu lúc này. Vui lòng thử lại.', token, valid: true
        });
      }
      return res.redirect(303, '/login?reset=1');
    },

    logout(req, res, next) {
      req.session.destroy((error) => {
        if (error) return next(error);
        res.clearCookie(sessionCookieName, {
          httpOnly: true,
          sameSite: 'lax',
          secure: process.env.NODE_ENV === 'production',
          path: '/'
        });
        return res.redirect(303, '/');
      });
    }
  };
}

module.exports = { createAuthController, registrationAvailable, loginAvailable, passwordResetAvailable };
