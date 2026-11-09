import assert from 'node:assert/strict';
import { test } from 'node:test';

const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
const ok = (data = {}) => json({ ok: true, data });
const unauthorized = () => json({ ok: false, error: { code: 'UNAUTHENTICATED', message: 'Not signed in' } }, 401);
const pathOf = (input) => new URL(input, 'http://localhost').pathname;

test('separate tabs serialize refresh-cookie rotation with the local-storage lease fallback', async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const entries = new Map();
  globalThis.window = {
    dispatchEvent() {},
    localStorage: {
      getItem: (key) => entries.get(key) ?? null,
      setItem: (key, value) => entries.set(key, value),
      removeItem: (key) => entries.delete(key)
    }
  };
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {} });

  let activeRefreshes = 0;
  let maximumActiveRefreshes = 0;
  let refreshes = 0;
  globalThis.fetch = async (url, init) => {
    const path = pathOf(url);
    if (path === '/api/admin/dashboard') {
      if (init.headers.get('Authorization')?.endsWith('-old')) return unauthorized();
      return ok({ path });
    }
    if (path === '/api/auth/csrf') return ok({ csrfToken: 'csrf-cross-tab' });
    if (path === '/api/auth/refresh') {
      activeRefreshes += 1;
      maximumActiveRefreshes = Math.max(maximumActiveRefreshes, activeRefreshes);
      await new Promise((resolve) => setTimeout(resolve, 30));
      activeRefreshes -= 1;
      refreshes += 1;
      return ok({ accessToken: `jwt-tab-${refreshes}` });
    }
    throw new Error(`Unexpected request: ${path}`);
  };

  try {
    const tabA = await import('../src/auth/http.js?tab-a');
    const tabB = await import('../src/auth/http.js?tab-b');
    tabA.setAccessToken('jwt-tab-a-old');
    tabB.setAccessToken('jwt-tab-b-old');
    const [resultA, resultB] = await Promise.all([
      tabA.request('/api/admin/dashboard'),
      tabB.request('/api/admin/dashboard')
    ]);
    assert.deepEqual(resultA, { path: '/api/admin/dashboard' });
    assert.deepEqual(resultB, { path: '/api/admin/dashboard' });
    assert.equal(maximumActiveRefreshes, 1);
    assert.equal(refreshes, 2);
    assert.equal(entries.has('bephoi-auth-refresh-lock'), false);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
    if (navigatorDescriptor) Object.defineProperty(globalThis, 'navigator', navigatorDescriptor);
    else delete globalThis.navigator;
  }
});

test('a failed fallback refresh is not accidentally issued twice', async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const entries = new Map();
  globalThis.window = {
    dispatchEvent() {},
    localStorage: {
      getItem: (key) => entries.get(key) ?? null,
      setItem: (key, value) => entries.set(key, value),
      removeItem: (key) => entries.delete(key)
    }
  };
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {} });

  let refreshCount = 0;
  globalThis.fetch = async (url) => {
    const path = pathOf(url);
    if (path === '/api/admin/dashboard') return unauthorized();
    if (path === '/api/auth/csrf') return ok({ csrfToken: 'csrf-refresh-failure' });
    if (path === '/api/auth/refresh') { refreshCount += 1; return unauthorized(); }
    throw new Error(`Unexpected request: ${path}`);
  };

  try {
    const tab = await import('../src/auth/http.js?tab-refresh-failure');
    tab.setAccessToken('jwt-refresh-failure-old');
    await assert.rejects(tab.request('/api/admin/dashboard'), (error) => error.code === 'SESSION_EXPIRED');
    assert.equal(refreshCount, 1);
    assert.equal(entries.has('bephoi-auth-refresh-lock'), false);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
    if (navigatorDescriptor) Object.defineProperty(globalThis, 'navigator', navigatorDescriptor);
    else delete globalThis.navigator;
  }
});
