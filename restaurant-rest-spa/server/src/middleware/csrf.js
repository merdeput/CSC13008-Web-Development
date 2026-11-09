const crypto = require('node:crypto');
const { HttpError } = require('../lib/errors');

const CSRF_COOKIE = 'bephoi.csrf';
const REFRESH_COOKIE = 'bephoi.refresh';

function sameSiteValue() {
  const value = String(process.env.AUTH_COOKIE_SAME_SITE || 'lax').toLowerCase();
  return ['lax', 'strict', 'none'].includes(value) ? value : 'lax';
}

function cookieBaseOptions() {
  const sameSite = sameSiteValue();
  return {
    secure: process.env.NODE_ENV === 'production' || sameSite === 'none',
    sameSite,
    path: '/api/auth'
  };
}

function readCookie(req, name) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0 || part.slice(0, separator).trim() !== name) continue;
    try { return decodeURIComponent(part.slice(separator + 1).trim()); }
    catch { return null; }
  }
  return null;
}

function equalToken(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function issueCsrf(req, res, next) {
  const existing = readCookie(req, CSRF_COOKIE);
  const token = existing && /^[A-Za-z0-9_-]{40,60}$/.test(existing)
    ? existing
    : crypto.randomBytes(32).toString('base64url');
  res.cookie(CSRF_COOKIE, token, { ...cookieBaseOptions(), httpOnly: false, maxAge: 12 * 60 * 60 * 1000 });
  res.set('Cache-Control', 'no-store');
  return res.json({ ok: true, data: { csrfToken: token } });
}

function requireCsrf(req, _res, next) {
  const cookieToken = readCookie(req, CSRF_COOKIE);
  const headerToken = req.get('X-CSRF-Token');
  const allowedOrigins = String(process.env.CLIENT_ORIGIN || 'http://localhost:5173')
    .split(',').map((origin) => origin.trim()).filter(Boolean);
  const origin = req.get('Origin');
  if (origin && !allowedOrigins.includes(origin)) return next(new HttpError(403, 'Yêu cầu không hợp lệ.', { code: 'CSRF_INVALID' }));
  if (!equalToken(cookieToken, headerToken)) return next(new HttpError(403, 'CSRF token không hợp lệ hoặc đã hết hạn.', { code: 'CSRF_INVALID' }));
  return next();
}

function setRefreshCookie(res, token, ttlSeconds) {
  res.cookie(REFRESH_COOKIE, token, {
    ...cookieBaseOptions(), httpOnly: true, maxAge: ttlSeconds * 1000
  });
}

function clearAuthCookies(res) {
  const options = cookieBaseOptions();
  res.clearCookie(REFRESH_COOKIE, { ...options, httpOnly: true });
  res.clearCookie(CSRF_COOKIE, { ...options, httpOnly: false });
}

module.exports = { CSRF_COOKIE, REFRESH_COOKIE, issueCsrf, requireCsrf, readCookie, setRefreshCookie, clearAuthCookies };
