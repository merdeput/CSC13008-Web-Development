const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { once } = require('node:events');
const { createApp } = require('../server/src/app');
const { signAccessToken } = require('../server/src/lib/access-token-signer');
const { verifyAccessToken } = require('../server/src/lib/access-token-verifier');
const { getCookieNames } = require('../server/src/lib/auth-cookies');

process.env.RECAPTCHA_SITE_KEY = 'test-site-key';
process.env.RECAPTCHA_SECRET_KEY = 'test-secret-key';
process.env.RECAPTCHA_ALLOWED_HOSTNAMES = 'localhost';
process.env.OTP_HMAC_SECRET = 'test-otp-hmac-secret-123456789012';
process.env.LOGIN_COUNTER_HMAC_SECRET = 'test-login-counter-secret-123456789';
process.env.RESEND_API_KEY = 'test-resend-key';
process.env.EMAIL_FROM = 'Bep Hoi <noreply@example.test>';
process.env.PUBLIC_BASE_URL = 'http://localhost:5173';

const ORIGIN = 'http://localhost:5173';
const JWT_CONFIG = {
  secret: 'unit-test-jwt-secret-long-enough-for-hs256',
  issuer: 'https://api.example.test',
  audience: 'https://api.example.test/api',
  accessTtlSeconds: 900
};
const USER = {
  id: '537d4e6d-14d7-49d3-8de4-57a6fd737b99',
  email: 'active@example.test',
  role: 'viewer'
};

function makeServices() {
  const state = { registration: null, activation: null, resent: null, loginFailures: 0, reset: null };
  return {
    state,
    services: {
      auth: {
        async beginRegistration(input) { state.registration = input; return { userId: crypto.randomUUID(), created: true }; },
        async activateAccountByEmail(email, code) { state.activation = { email, code }; return { status: code === '123456' ? 'activated' : 'invalid' }; },
        async resendActivationCodeByEmail(email) { state.resent = email; return { status: 'sent' }; },
        async getLoginLockout() { return { locked: false }; },
        async recordLoginFailure() { state.loginFailures += 1; },
        async clearLoginFailures() {},
        async authenticate(email, password) { return email === USER.email && password === 'Correct horse battery staple' ? USER : null; },
        async requestPasswordReset(email) { state.reset = email; return { queued: true }; },
        async completePasswordReset(token, password) { return token === 'valid-reset-token' && password.length >= 12; }
      },
      admin: { async overview() { return { dishes: 1 }; } },
      reservations: { async upcoming() { return []; } },
      dishes: {}, categories: {}, chefs: {}, ingredients: {}
    }
  };
}

function makeTokenSessions() {
  const sessions = new Map();
  const refreshTokens = new Map();
  return {
    sessions,
    refreshTokens,
    async createSession(userId) {
      const sessionId = crypto.randomUUID();
      const refreshToken = crypto.randomBytes(32).toString('base64url');
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      sessions.set(sessionId, { userId, revoked: false });
      refreshTokens.set(refreshToken, sessionId);
      return { sessionId, expiresAt, refreshToken };
    },
    async findActiveSession(sessionId) {
      const session = sessions.get(sessionId);
      return session && !session.revoked ? { sessionId, user: USER } : null;
    },
    async rotate(refreshToken) {
      const sessionId = refreshTokens.get(refreshToken);
      if (!sessionId) return { status: 'invalid' };
      if (refreshTokens.get(`${refreshToken}:used`) === sessionId) {
        const session = sessions.get(sessionId);
        if (session) session.revoked = true;
        return { status: 'reuse' };
      }
      const nextToken = crypto.randomBytes(32).toString('base64url');
      refreshTokens.set(`${refreshToken}:used`, sessionId);
      refreshTokens.set(nextToken, sessionId);
      return { status: 'rotated', sessionId, user: USER, refreshToken: nextToken, expiresAt: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000) };
    },
    async findSessionForRefreshToken(refreshToken) { return refreshTokens.get(refreshToken) || null; },
    async revokeSession(sessionId) {
      const session = sessions.get(sessionId);
      if (!session) return false;
      session.revoked = true;
      return true;
    }
  };
}

async function startApp({ secureCookies = false, trustedOrigins = [ORIGIN] } = {}) {
  const { services, state } = makeServices();
  const tokenSessions = makeTokenSessions();
  const app = createApp({
    services,
    tokenSessions,
    jwtConfig: JWT_CONFIG,
    csrfSecret: 'csrf-unit-test-secret-long-enough-for-hmac',
    trustedOrigins,
    secureCookies,
    verifyRecaptcha: async () => true
  });
  const server = app.listen(0);
  await once(server, 'listening');
  const address = server.address();
  return {
    app, state, tokenSessions, server, baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  };
}

async function getCsrf(baseUrl, origin = ORIGIN, cookieName = getCookieNames(false).csrf) {
  const response = await fetch(`${baseUrl}/api/auth/csrf`, { headers: { Origin: origin } });
  const body = await response.json();
  const setCookies = response.headers.getSetCookie();
  const csrfCookie = setCookies.find((value) => value.startsWith(`${cookieName}=`));
  assert.ok(csrfCookie, 'CSRF cookie is set');
  return { response, body, csrfCookie: csrfCookie.split(';')[0], setCookies };
}

function postHeaders(token, csrfCookie, origin = ORIGIN) {
  return {
    Origin: origin,
    Cookie: csrfCookie,
    'Content-Type': 'application/json',
    'X-CSRF-Token': token
  };
}

test('registration, OTP verification, and resend expose generic REST responses', async (t) => {
  const ctx = await startApp();
  t.after(ctx.close);
  const { body: csrf, csrfCookie } = await getCsrf(ctx.baseUrl);

  const registration = await fetch(`${ctx.baseUrl}/api/auth/register`, {
    method: 'POST', headers: postHeaders(csrf.data.csrfToken, csrfCookie),
    body: JSON.stringify({ email: '  NewUser@Example.Test ', password: 'Twelve characters!4', captchaToken: 'valid' })
  });
  assert.equal(registration.status, 202);
  assert.equal((await registration.json()).ok, true);
  assert.equal(ctx.state.registration.email, 'newuser@example.test');
  assert.match(ctx.state.registration.passwordHash, /^scrypt\$/);

  const activation = await fetch(`${ctx.baseUrl}/api/auth/verify-otp`, {
    method: 'POST', headers: postHeaders(csrf.data.csrfToken, csrfCookie),
    body: JSON.stringify({ email: 'newuser@example.test', code: '123456' })
  });
  assert.equal(activation.status, 200);
  assert.deepEqual((await activation.json()).data, { verified: true, loginRequired: true });
  assert.deepEqual(ctx.state.activation, { email: 'newuser@example.test', code: '123456' });

  const resend = await fetch(`${ctx.baseUrl}/api/auth/resend-otp`, {
    method: 'POST', headers: postHeaders(csrf.data.csrfToken, csrfCookie),
    body: JSON.stringify({ email: 'newuser@example.test', captchaToken: 'valid' })
  });
  assert.equal(resend.status, 202);
  assert.equal(ctx.state.resent, 'newuser@example.test');
});

test('REST registration and password reset reject passwords missing required composition', async (t) => {
  const ctx = await startApp();
  t.after(ctx.close);
  const { body: csrf, csrfCookie } = await getCsrf(ctx.baseUrl);
  const headers = postHeaders(csrf.data.csrfToken, csrfCookie);
  const weakPassword = 'twelve characters!4';

  const registration = await fetch(`${ctx.baseUrl}/api/auth/register`, {
    method: 'POST', headers,
    body: JSON.stringify({ email: 'new@example.test', password: weakPassword, captchaToken: 'valid' })
  });
  assert.equal(registration.status, 400);
  assert.equal((await registration.json()).error.code, 'VALIDATION_FAILED');
  assert.equal(ctx.state.registration, null);

  const reset = await fetch(`${ctx.baseUrl}/api/auth/password-reset/confirm`, {
    method: 'POST', headers,
    body: JSON.stringify({ token: 'valid-reset-token', newPassword: weakPassword })
  });
  assert.equal(reset.status, 400);
  assert.equal((await reset.json()).error.code, 'VALIDATION_FAILED');
});

test('JWT validates HMAC, type, issuer, audience, claims, and expiry strictly', () => {
  const now = Date.now();
  const token = signAccessToken({ userId: USER.id, sessionId: crypto.randomUUID() }, JWT_CONFIG, now);
  const claims = verifyAccessToken(token, JWT_CONFIG, now);
  assert.equal(claims.sub, USER.id);
  assert.equal(claims.iss, JWT_CONFIG.issuer);
  assert.equal(claims.aud, JWT_CONFIG.audience);
  assert.equal(claims.exp - claims.iat, 900);
  assert.ok(claims.jti);
  assert.ok(claims.sid);
  const changedSignature = `${token.slice(0, -1)}${token.endsWith('x') ? 'y' : 'x'}`;
  assert.equal(verifyAccessToken(changedSignature, JWT_CONFIG, now), null);
  assert.equal(verifyAccessToken(token, { ...JWT_CONFIG, issuer: 'https://other.example.test' }, now), null);
  assert.equal(verifyAccessToken(token, { ...JWT_CONFIG, audience: 'https://other.example.test/api' }, now), null);
  assert.equal(verifyAccessToken(token, JWT_CONFIG, now + 16 * 60 * 1000), null);

  const [header, payload] = token.split('.');
  const badHeader = Buffer.from(JSON.stringify({ alg: 'none', typ: 'at+jwt' })).toString('base64url');
  const unsigned = `${badHeader}.${payload}`;
  const signature = crypto.createHmac('sha256', JWT_CONFIG.secret).update(unsigned).digest('base64url');
  assert.equal(verifyAccessToken(`${unsigned}.${signature}`, JWT_CONFIG, now), null);
  assert.ok(header);
});

test('login issues a 15-minute bearer token; admin APIs require it and retain the existing viewer policy', async (t) => {
  const ctx = await startApp();
  t.after(ctx.close);
  const { body: csrf, csrfCookie } = await getCsrf(ctx.baseUrl);
  const login = await fetch(`${ctx.baseUrl}/api/auth/login`, {
    method: 'POST', headers: postHeaders(csrf.data.csrfToken, csrfCookie),
    body: JSON.stringify({ email: USER.email, password: 'Correct horse battery staple', captchaToken: 'valid' })
  });
  assert.equal(login.status, 200);
  const loginBody = await login.json();
  assert.equal(loginBody.data.expiresIn, 900);
  assert.equal(loginBody.data.user.id, USER.id);
  assert.equal(loginBody.data.user.role, 'viewer');
  assert.equal(verifyAccessToken(loginBody.data.accessToken, JWT_CONFIG).sub, USER.id);
  assert.equal(Object.hasOwn(loginBody.data, 'refreshToken'), false);
  const cookieLines = login.headers.getSetCookie();
  const refreshCookie = cookieLines.find((value) => value.startsWith(`${getCookieNames(false).refresh}=`));
  assert.ok(refreshCookie);
  assert.match(refreshCookie, /HttpOnly/i);
  assert.match(refreshCookie, /SameSite=Lax/i);
  assert.doesNotMatch(refreshCookie, /Domain=/i);
  assert.match(refreshCookie, /Path=\//i);
  assert.doesNotMatch(refreshCookie, /Secure/i, 'development cookie does not claim Secure over HTTP');

  const unauthenticated = await fetch(`${ctx.baseUrl}/api/admin/dashboard`);
  assert.equal(unauthenticated.status, 401);
  const authorized = await fetch(`${ctx.baseUrl}/api/admin/dashboard`, { headers: { Authorization: `Bearer ${loginBody.data.accessToken}` } });
  assert.equal(authorized.status, 200);
  assert.deepEqual((await authorized.json()).data.counts, { dishes: 1 });
});

test('refresh rotation, logout, secure cookie attributes, CSRF, and CORS are enforced', async (t) => {
  const ctx = await startApp({ secureCookies: true });
  t.after(ctx.close);
  const cookieNames = getCookieNames(true);
  const { body: csrf, csrfCookie, setCookies } = await getCsrf(ctx.baseUrl, ORIGIN, cookieNames.csrf);
  const csrfHeader = csrf.data.csrfToken;
  const csrfLine = setCookies.find((value) => value.startsWith(`${cookieNames.csrf}=`));
  assert.match(csrfLine, /HttpOnly/i);
  assert.match(csrfLine, /Secure/i);
  assert.match(csrfLine, /SameSite=Lax/i);
  assert.match(csrfLine, /Path=\//i);
  assert.doesNotMatch(csrfLine, /Domain=/i);

  const preflight = await fetch(`${ctx.baseUrl}/api/auth/refresh`, {
    method: 'OPTIONS', headers: {
      Origin: ORIGIN,
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type,x-csrf-token'
    }
  });
  assert.equal(preflight.headers.get('access-control-allow-origin'), ORIGIN);
  assert.equal(preflight.headers.get('access-control-allow-credentials'), 'true');
  assert.match(preflight.headers.get('access-control-allow-headers'), /x-csrf-token/i);

  const missingCsrf = await fetch(`${ctx.baseUrl}/api/auth/logout`, {
    method: 'POST', headers: { Origin: ORIGIN, Cookie: csrfCookie }
  });
  assert.equal(missingCsrf.status, 403);

  const untrusted = await fetch(`${ctx.baseUrl}/api/auth/logout`, {
    method: 'POST', headers: postHeaders(csrfHeader, csrfCookie, 'https://evil.example')
  });
  assert.equal(untrusted.status, 403);

  const login = await fetch(`${ctx.baseUrl}/api/auth/login`, {
    method: 'POST', headers: postHeaders(csrfHeader, csrfCookie),
    body: JSON.stringify({ email: USER.email, password: 'Correct horse battery staple', captchaToken: 'valid' })
  });
  const access = (await login.json()).data.accessToken;
  const refreshed = await fetch(`${ctx.baseUrl}/api/auth/refresh`, {
    method: 'POST', headers: {
      ...postHeaders(csrfHeader, csrfCookie),
      Cookie: `${csrfCookie}; ${login.headers.getSetCookie().find((value) => value.startsWith(`${cookieNames.refresh}=`)).split(';')[0]}`
    }
  });
  assert.equal(refreshed.status, 200);
  const refreshedBody = await refreshed.json();
  assert.ok(refreshedBody.data.accessToken);
  assert.ok(refreshed.headers.getSetCookie().some((value) => value.startsWith(`${cookieNames.refresh}=`) && /Secure/i.test(value)));

  const logoutCsrfCookie = refreshed.headers.getSetCookie().find((value) => value.startsWith(`${cookieNames.csrf}=`)).split(';')[0];
  const logoutCsrfToken = refreshedBody.data.csrfToken;
  const validToken = signAccessToken({ userId: USER.id, sessionId: [...ctx.tokenSessions.sessions.keys()][0] }, JWT_CONFIG);
  const logout = await fetch(`${ctx.baseUrl}/api/auth/logout`, {
    method: 'POST', headers: {
      ...postHeaders(logoutCsrfToken, logoutCsrfCookie),
      Authorization: `Bearer ${validToken}`
    }
  });
  assert.equal(logout.status, 204);
  assert.ok(logout.headers.getSetCookie().some((value) => value.startsWith(`${cookieNames.refresh}=`) && /Max-Age=0/i.test(value)));
  const revoked = await fetch(`${ctx.baseUrl}/api/auth/me`, { headers: { Authorization: `Bearer ${access}` } });
  assert.equal(revoked.status, 401);
});

test('refresh endpoint rotates cookies and rejects replayed refresh tokens', async (t) => {
  const ctx = await startApp();
  t.after(ctx.close);
  const names = getCookieNames(false);
  const { body: csrf, csrfCookie } = await getCsrf(ctx.baseUrl);
  const login = await fetch(`${ctx.baseUrl}/api/auth/login`, {
    method: 'POST', headers: postHeaders(csrf.data.csrfToken, csrfCookie),
    body: JSON.stringify({ email: USER.email, password: 'Correct horse battery staple', captchaToken: 'valid' })
  });
  const oldRefresh = login.headers.getSetCookie().find((value) => value.startsWith(`${names.refresh}=`)).split(';')[0];
  const refresh = await fetch(`${ctx.baseUrl}/api/auth/refresh`, {
    method: 'POST', headers: {
      ...postHeaders(csrf.data.csrfToken, csrfCookie), Cookie: `${csrfCookie}; ${oldRefresh}`
    }
  });
  assert.equal(refresh.status, 200);
  const reused = await fetch(`${ctx.baseUrl}/api/auth/refresh`, {
    method: 'POST', headers: {
      ...postHeaders(csrf.data.csrfToken, csrfCookie), Cookie: `${csrfCookie}; ${oldRefresh}`
    }
  });
  assert.equal(reused.status, 401);
  assert.equal((await reused.json()).error.code, 'REFRESH_REUSE');
});
