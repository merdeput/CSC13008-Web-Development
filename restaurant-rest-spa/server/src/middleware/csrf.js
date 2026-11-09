const crypto = require('node:crypto');
const { getCookieNames, parseCookies } = require('../lib/auth-cookies');

function csrfSignature(value, secret) {
  return crypto.createHmac('sha256', secret).update(value).digest('base64url');
}

function createCsrfToken(secret) {
  const nonce = crypto.randomBytes(32).toString('base64url');
  return `${nonce}.${csrfSignature(nonce, secret)}`;
}

function constantStringEqual(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function isValidCsrfToken(cookieToken, submittedToken, secret) {
  if (!constantStringEqual(cookieToken, submittedToken)) return false;
  const parts = cookieToken.split('.');
  if (parts.length !== 2 || !/^[A-Za-z0-9_-]{43}$/.test(parts[0])) return false;
  return constantStringEqual(parts[1], csrfSignature(parts[0], secret));
}

function createCsrfMiddleware({ secret, trustedOrigins, secureCookies }) {
  function requireTrustedOrigin(req, res, next) {
    const origin = req.get('Origin');
    if (!origin || !trustedOrigins.includes(origin)) {
      return res.status(403).json({ ok: false, error: { code: 'UNTRUSTED_ORIGIN', message: 'The request origin is not allowed.' } });
    }
    return next();
  }

  function requireCsrf(req, res, next) {
    const cookieName = getCookieNames(secureCookies).csrf;
    const cookieToken = parseCookies(req.headers.cookie).get(cookieName);
    const submittedToken = req.get('X-CSRF-Token');
    if (!isValidCsrfToken(cookieToken, submittedToken, secret)) {
      return res.status(403).json({ ok: false, error: { code: 'CSRF_REJECTED', message: 'The CSRF token is missing or invalid.' } });
    }
    return next();
  }

  return { requireTrustedOrigin, requireCsrf };
}

module.exports = { createCsrfToken, isValidCsrfToken, createCsrfMiddleware };
