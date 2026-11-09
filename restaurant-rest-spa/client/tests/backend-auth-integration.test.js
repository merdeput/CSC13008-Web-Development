import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { once } from 'node:events';
import { test } from 'node:test';
import { authApi } from '../src/auth/api.js';
import { clearAccessToken, clearCsrfToken, request } from '../src/auth/http.js';

const require = createRequire(import.meta.url);
const { createApp } = require('../../server/src/app.js');
const ORIGIN = 'http://restaurant-client.test';
const JWT_CONFIG = {
  secret: 'integration-test-jwt-secret-at-least-32-bytes',
  issuer: 'https://api.example.test',
  audience: 'https://api.example.test/api',
  accessTtlSeconds: 900
};
const USER = {
  id: '537d4e6d-14d7-49d3-8de4-57a6fd737b99',
  email: 'integrated@example.test',
  role: 'viewer'
};

test('React auth client works against the Express JWT routes', async (t) => {
  const envValues = {
    RECAPTCHA_SITE_KEY: 'test-site-key',
    RECAPTCHA_SECRET_KEY: 'test-secret-key',
    RECAPTCHA_ALLOWED_HOSTNAMES: 'localhost',
    OTP_HMAC_SECRET: 'test-otp-hmac-secret-long-enough',
    LOGIN_COUNTER_HMAC_SECRET: 'test-login-counter-hmac-secret-long-enough',
    RESEND_API_KEY: 'test-resend-key',
    EMAIL_FROM: 'Bep Hoi <noreply@example.test>',
    PUBLIC_BASE_URL: 'http://localhost:5173'
  };
  const previousEnv = new Map(Object.keys(envValues).map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(envValues)) process.env[key] = value;
  t.after(() => {
    for (const [key, value] of previousEnv) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    clearAccessToken();
    clearCsrfToken();
    globalThis.fetch = nativeFetch;
  });

  let registration;
  let resetRequest;
  const services = {
    auth: {
      async beginRegistration(input) { registration = input; return { created: true }; },
      async activateAccountByEmail(email, code) { return email === USER.email && code === '123456' ? { status: 'activated' } : { status: 'invalid' }; },
      async resendActivationCodeByEmail(email) { return { status: email === USER.email ? 'sent' : 'unavailable' }; },
      async getLoginLockout() { return { locked: false }; },
      async recordLoginFailure() {},
      async clearLoginFailures() {},
      async authenticate(email, password) { return email === USER.email && password === 'Correct horse battery staple!4' ? USER : null; },
      async requestPasswordReset(email) { resetRequest = email; return { queued: true }; },
      async completePasswordReset(token, password) { return token === 'single-use-token' && password.length >= 12; }
    },
    admin: { async overview() { return { dishes: 2 }; } },
    reservations: { async upcoming() { return []; } },
    dishes: {}, categories: {}, chefs: {}, ingredients: {}
  };
  const sessions = new Map();
  const refreshTokens = new Map();
  const tokenSessions = {
    async createSession(userId) {
      const sessionId = crypto.randomUUID();
      const refreshToken = crypto.randomBytes(32).toString('base64url');
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      sessions.set(sessionId, { userId, revoked: false });
      refreshTokens.set(refreshToken, sessionId);
      return { sessionId, refreshToken, expiresAt };
    },
    async findActiveSession(sessionId) {
      const session = sessions.get(sessionId);
      return session && !session.revoked ? { sessionId, user: USER } : null;
    },
    async rotate(refreshToken) {
      const sessionId = refreshTokens.get(refreshToken);
      if (!sessionId) return { status: 'invalid' };
      refreshTokens.delete(refreshToken);
      const nextToken = crypto.randomBytes(32).toString('base64url');
      refreshTokens.set(nextToken, sessionId);
      return {
        status: 'rotated', sessionId, refreshToken: nextToken,
        expiresAt: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000), user: USER
      };
    },
    async findSessionForRefreshToken(refreshToken) { return refreshTokens.get(refreshToken) || null; },
    async revokeSession(sessionId) {
      const session = sessions.get(sessionId);
      if (!session) return false;
      session.revoked = true;
      return true;
    }
  };
  const app = createApp({
    services,
    tokenSessions,
    jwtConfig: JWT_CONFIG,
    csrfSecret: 'integration-test-csrf-secret-at-least-32-bytes',
    trustedOrigins: [ORIGIN],
    secureCookies: false,
    verifyRecaptcha: async () => true
  });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));

  const nativeFetch = globalThis.fetch;
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const cookies = new Map();
  globalThis.fetch = async (input, init = {}) => {
    const headers = new Headers(init.headers || {});
    headers.set('Origin', ORIGIN);
    if (!headers.has('Cookie') && cookies.size) {
      headers.set('Cookie', [...cookies].map(([name, value]) => `${name}=${value}`).join('; '));
    }
    const response = await nativeFetch(new URL(input, baseUrl), { ...init, headers });
    const setCookies = response.headers.getSetCookie?.() || [response.headers.get('set-cookie')].filter(Boolean);
    for (const line of setCookies) {
      const [pair] = line.split(';');
      const separator = pair.indexOf('=');
      if (separator < 1) continue;
      const name = pair.slice(0, separator);
      if (/Max-Age=0/i.test(line)) cookies.delete(name);
      else cookies.set(name, pair.slice(separator + 1));
    }
    return response;
  };

  await authApi.register({ email: USER.email, password: 'Correct horse battery staple!4', captchaToken: 'valid-captcha' });
  assert.equal(registration.email, USER.email);
  assert.match(registration.passwordHash, /^scrypt\$/);
  await authApi.verifyEmail({ email: USER.email, code: '123456' });
  await authApi.resendOtp({ email: USER.email, captchaToken: 'valid-captcha' });

  const user = await authApi.login({ email: USER.email, password: 'Correct horse battery staple!4', captchaToken: 'valid-captcha' });
  assert.equal(user.id, USER.id);
  const dashboard = await request('/api/admin/dashboard');
  assert.deepEqual(dashboard.counts, { dishes: 2 });

  clearAccessToken();
  clearCsrfToken();
  const restored = await authApi.restore();
  assert.equal(restored.email, USER.email);

  await authApi.forgotPassword({ email: USER.email, captchaToken: 'valid-captcha' });
  assert.equal(resetRequest, USER.email);
  await authApi.resetPassword({ token: 'single-use-token', newPassword: 'A sufficiently long new password!4' });
  await authApi.logout();
  assert.equal(cookies.size, 0);
});
