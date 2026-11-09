import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { authApi } from '../src/auth/api.js';
import { clearAccessToken, clearCsrfToken, getAccessToken, request, setAccessToken } from '../src/auth/http.js';
import { routeAccess } from '../src/auth/route-access.js';

const originalFetch = globalThis.fetch;
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
const ok = (data = {}) => json({ ok: true, data });
const fail = (status, code = 'UNAUTHENTICATED', message = 'Not signed in') => json({ ok: false, error: { code, message } }, status);
const pathOf = (input) => new URL(input, 'http://localhost').pathname;
const bodyOf = (init) => init?.body ? JSON.parse(init.body) : undefined;

afterEach(() => {
  globalThis.fetch = originalFetch;
  clearAccessToken();
  clearCsrfToken();
});

test('registration sends JSON and the acquired CSRF and CAPTCHA tokens', async () => {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ path: pathOf(url), init, body: bodyOf(init) });
    if (pathOf(url) === '/api/auth/csrf') return ok({ csrfToken: 'csrf-register' });
    return ok({ message: 'If eligible, check your email.' });
  };

  await authApi.register({ email: 'new@example.test', password: 'long-enough-password', recaptchaToken: 'captcha-register' });
  assert.deepEqual(calls.map(({ path }) => path), ['/api/auth/csrf', '/api/auth/register']);
  assert.equal(calls[1].init.headers.get('X-CSRF-Token'), 'csrf-register');
  assert.equal(calls[1].init.headers.get('Content-Type'), 'application/json');
  assert.deepEqual(calls[1].body, { email: 'new@example.test', password: 'long-enough-password', recaptchaToken: 'captcha-register' });
  assert.equal(calls[1].init.credentials, 'include');
  assert.equal(getAccessToken(), null);
});

test('email OTP verification and resend use separate mocked operations; verification does not log in', async () => {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ path: pathOf(url), init, body: bodyOf(init) });
    if (pathOf(url) === '/api/auth/csrf') return ok({ token: 'csrf-otp' });
    return ok({ message: 'Accepted.' });
  };

  await authApi.verifyEmail({ email: 'person@example.test', code: '123456' });
  await authApi.resendOtp({ email: 'person@example.test', recaptchaToken: 'captcha-resend' });
  assert.equal(calls[1].path, '/api/auth/verify-email');
  assert.deepEqual(calls[1].body, { email: 'person@example.test', code: '123456' });
  assert.equal(calls[2].path, '/api/auth/resend-otp');
  assert.deepEqual(calls[2].body, { email: 'person@example.test', recaptchaToken: 'captcha-resend' });
  assert.equal(calls[1].init.headers.get('X-CSRF-Token'), 'csrf-otp');
  assert.equal(calls[2].init.headers.get('X-CSRF-Token'), 'csrf-otp');
  assert.equal(getAccessToken(), null);
});

test('login stores only an in-memory access token and returns the user', async () => {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ path: pathOf(url), init, body: bodyOf(init) });
    if (pathOf(url) === '/api/auth/csrf') return ok({ csrfToken: 'csrf-login' });
    return ok({ accessToken: 'jwt-memory-only', user: { id: 'u-1', email: 'person@example.test', role: 'viewer' } });
  };

  const user = await authApi.login({ email: 'person@example.test', password: 'password', recaptchaToken: 'captcha-login' });
  assert.equal(calls[1].path, '/api/auth/login');
  assert.equal(calls[1].init.headers.get('X-CSRF-Token'), 'csrf-login');
  assert.deepEqual(calls[1].body, { email: 'person@example.test', password: 'password', recaptchaToken: 'captcha-login' });
  assert.equal(user.id, 'u-1');
  assert.equal(getAccessToken(), 'jwt-memory-only');
});

test('password recovery uses generic forgot-password and reset-password JSON operations', async () => {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ path: pathOf(url), init, body: bodyOf(init) });
    if (pathOf(url) === '/api/auth/csrf') return ok({ csrfToken: 'csrf-password' });
    return ok({ message: 'Accepted.' });
  };

  await authApi.forgotPassword({ email: 'person@example.test', recaptchaToken: 'captcha-reset-request' });
  await authApi.resetPassword({ token: 'single-use-reset-token', password: 'new-long-password' });
  assert.equal(calls[1].path, '/api/auth/forgot-password');
  assert.deepEqual(calls[1].body, { email: 'person@example.test', recaptchaToken: 'captcha-reset-request' });
  assert.equal(calls[2].path, '/api/auth/reset-password');
  assert.deepEqual(calls[2].body, { token: 'single-use-reset-token', password: 'new-long-password' });
  assert.equal(calls[1].init.headers.get('X-CSRF-Token'), 'csrf-password');
  assert.equal(calls[2].init.headers.get('X-CSRF-Token'), 'csrf-password');
});

test('reload restoration obtains CSRF, refreshes with cookies, then calls /me with Bearer auth', async () => {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ path: pathOf(url), init, body: bodyOf(init) });
    if (pathOf(url) === '/api/auth/csrf') return ok({ csrfToken: 'csrf-refresh' });
    if (pathOf(url) === '/api/auth/refresh') return ok({ accessToken: 'jwt-after-refresh' });
    if (pathOf(url) === '/api/auth/me') return ok({ user: { id: 'u-2', email: 'restored@example.test', role: 'viewer' } });
    throw new Error(`Unexpected request: ${url}`);
  };

  const result = await authApi.restore();
  assert.equal(result.user.email, 'restored@example.test');
  assert.deepEqual(calls.map(({ path }) => path), ['/api/auth/csrf', '/api/auth/refresh', '/api/auth/me']);
  assert.equal(calls[1].init.method, 'POST');
  assert.equal(calls[1].init.credentials, 'include');
  assert.equal(calls[1].init.headers.get('X-CSRF-Token'), 'csrf-refresh');
  assert.equal(calls[1].init.headers.has('Authorization'), false);
  assert.equal(calls[2].init.headers.get('Authorization'), 'Bearer jwt-after-refresh');
});

test('logout includes CSRF and the current bearer token, then clears memory', async () => {
  const calls = [];
  setAccessToken('jwt-logout');
  globalThis.fetch = async (url, init) => {
    calls.push({ path: pathOf(url), init });
    if (pathOf(url) === '/api/auth/csrf') return ok({ csrfToken: 'csrf-logout' });
    return ok({ message: 'Signed out.' });
  };

  await authApi.logout();
  const logout = calls.find(({ path }) => path === '/api/auth/logout');
  assert.ok(logout);
  assert.equal(logout.init.headers.get('X-CSRF-Token'), 'csrf-logout');
  assert.equal(logout.init.headers.get('Authorization'), 'Bearer jwt-logout');
  assert.equal(logout.init.credentials, 'include');
  assert.equal(getAccessToken(), null);
});

test('protected route decisions cover loading, unauthenticated, authenticated, and role-aware UI states', () => {
  const viewer = { id: 'u-3', role: 'viewer' };
  assert.equal(routeAccess('loading', null), 'loading');
  assert.equal(routeAccess('unauthenticated', null), 'redirect');
  assert.equal(routeAccess('authenticated', viewer), 'allow');
  assert.equal(routeAccess('authenticated', viewer, ['admin']), 'forbidden');
  assert.equal(routeAccess('authenticated', viewer, ['viewer']), 'allow');
});

test('a protected 401 refreshes once and retries with the new Bearer token', async () => {
  const calls = [];
  setAccessToken('jwt-old');
  globalThis.fetch = async (url, init) => {
    const path = pathOf(url);
    calls.push({ path, init });
    if (path === '/api/admin/dashboard' && init.headers.get('Authorization') === 'Bearer jwt-old') return fail(401, 'ACCESS_TOKEN_EXPIRED');
    if (path === '/api/auth/csrf') return ok({ csrfToken: 'csrf-retry' });
    if (path === '/api/auth/refresh') return ok({ accessToken: 'jwt-new' });
    if (path === '/api/admin/dashboard' && init.headers.get('Authorization') === 'Bearer jwt-new') return ok({ count: 4 });
    throw new Error(`Unexpected request: ${path}`);
  };

  assert.deepEqual(await request('/api/admin/dashboard'), { count: 4 });
  assert.equal(calls.filter(({ path }) => path === '/api/auth/refresh').length, 1);
  assert.equal(calls.filter(({ path }) => path === '/api/admin/dashboard').length, 2);
});

test('an expired refresh ends the session without retry loops', async () => {
  const calls = [];
  setAccessToken('jwt-expired');
  globalThis.fetch = async (url, init) => {
    const path = pathOf(url);
    calls.push(path);
    if (path === '/api/admin/dishes') return fail(401, 'ACCESS_TOKEN_EXPIRED');
    if (path === '/api/auth/csrf') return ok({ csrfToken: 'csrf-expired' });
    if (path === '/api/auth/refresh') return fail(200, 'REFRESH_EXPIRED', 'Refresh token expired');
    throw new Error(`Unexpected request: ${path}`);
  };

  await assert.rejects(request('/api/admin/dishes'), (error) => error.code === 'SESSION_EXPIRED' && error.status === 401);
  assert.deepEqual(calls, ['/api/admin/dishes', '/api/auth/csrf', '/api/auth/refresh']);
  assert.equal(getAccessToken(), null);
});

test('a refresh network failure is reported as unavailable, not as an expired session', async () => {
  const calls = [];
  setAccessToken('jwt-network');
  globalThis.fetch = async (url) => {
    const path = pathOf(url);
    calls.push(path);
    if (path === '/api/admin/dashboard') return fail(401, 'ACCESS_TOKEN_EXPIRED');
    if (path === '/api/auth/csrf') return ok({ csrfToken: 'csrf-network' });
    if (path === '/api/auth/refresh') throw new TypeError('offline');
    throw new Error(`Unexpected request: ${path}`);
  };

  await assert.rejects(request('/api/admin/dashboard'), (error) => error.code === 'SESSION_UNAVAILABLE' && error.status === 0);
  assert.deepEqual(calls, ['/api/admin/dashboard', '/api/auth/csrf', '/api/auth/refresh']);
});

test('concurrent protected 401 responses share one refresh operation', async () => {
  const calls = [];
  let adminCount = 0;
  setAccessToken('jwt-concurrent-old');
  globalThis.fetch = async (url, init) => {
    const path = pathOf(url);
    calls.push({ path, init });
    if (path.startsWith('/api/admin/')) {
      adminCount += 1;
      if (init.headers.get('Authorization') === 'Bearer jwt-concurrent-old') return fail(401, 'ACCESS_TOKEN_EXPIRED');
      return ok({ path });
    }
    if (path === '/api/auth/csrf') return ok({ csrfToken: 'csrf-concurrent' });
    if (path === '/api/auth/refresh') return ok({ accessToken: 'jwt-concurrent-new' });
    throw new Error(`Unexpected request: ${path}`);
  };

  const [dashboard, dishes] = await Promise.all([
    request('/api/admin/dashboard'),
    request('/api/admin/dishes')
  ]);
  assert.equal(dashboard.path, '/api/admin/dashboard');
  assert.equal(dishes.path, '/api/admin/dishes');
  assert.equal(calls.filter(({ path }) => path === '/api/auth/refresh').length, 1);
  assert.equal(adminCount, 4);
  assert.equal(calls.filter(({ path }) => path === '/api/admin/dashboard').length, 2);
  assert.equal(calls.filter(({ path }) => path === '/api/admin/dishes').length, 2);
  assert.ok(calls.filter(({ path }) => path.startsWith('/api/admin/') && path !== '/api/auth/refresh')
    .slice(-2).every(({ init }) => init.headers.get('Authorization') === 'Bearer jwt-concurrent-new'));
});
