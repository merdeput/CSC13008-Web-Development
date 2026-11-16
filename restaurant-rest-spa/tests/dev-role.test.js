const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../server/src/app');
const chefId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const origin = 'http://localhost:5173';

test('temporary setter requires development opt-in, session and CSRF', async (t) => {
  const savedEnv = process.env.NODE_ENV;
  const savedFlag = process.env.ENABLE_DEV_ROLE_SETTER;
  t.after(() => { if (savedEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = savedEnv; if (savedFlag === undefined) delete process.env.ENABLE_DEV_ROLE_SETTER; else process.env.ENABLE_DEV_ROLE_SETTER = savedFlag; });
  let account = { id: 'user-1', email: 'user@example.test', role: 'viewer', chefId: null };
  const db = { chef: { async findMany() { return [{ id: chefId, name: 'Chef' }]; }, async findUnique({ where }) { return where.id === chefId ? { id: chefId } : null; } }, user: { async update({ where, data }) { assert.equal(where.id, account.id); Object.assign(account, data); return { ...account }; } } };
  const tokenSessions = { async findActiveCookieSession(token) { return token === 'valid' ? { user: { ...account }, sessionId: 'session' } : null; } };
  async function start(env, flag) {
    process.env.NODE_ENV = env; process.env.ENABLE_DEV_ROLE_SETTER = flag;
    const app = createApp({ db, services: {}, tokenSessions, jwtConfig: { secret: 'x'.repeat(32), issuer: 'test', audience: 'test' }, csrfSecret: 'x'.repeat(32), trustedOrigins: [origin], secureCookies: false, disableAuthCleanup: true });
    const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve)); t.after(() => server.close());
    return `http://127.0.0.1:${server.address().port}`;
  }
  const production = await start('production', 'true');
  assert.equal((await fetch(`${production}/api/dev/role`, { headers: { Cookie: 'bephoi.rt=valid' } })).status, 404);
  const disabled = await start('development', 'false');
  assert.equal((await fetch(`${disabled}/api/dev/role`, { headers: { Cookie: 'bephoi.rt=valid' } })).status, 404);
  const base = await start('development', 'true');
  assert.equal((await fetch(`${base}/api/dev/role`)).status, 401);
  assert.equal((await fetch(`${base}/api/dev/role`, { headers: { Cookie: 'bephoi.rt=valid' } })).status, 200);
  const csrfResponse = await fetch(`${base}/api/auth/csrf`);
  const csrf = (await csrfResponse.json()).data.csrfToken;
  const csrfCookie = csrfResponse.headers.getSetCookie()[0].split(';')[0];
  const post = (body, validCsrf = true) => fetch(`${base}/api/dev/role`, { method: 'POST', headers: { Cookie: `bephoi.rt=valid; ${csrfCookie}`, Origin: origin, 'Content-Type': 'application/json', ...(validCsrf ? { 'X-CSRF-Token': csrf } : {}) }, body: JSON.stringify(body) });
  assert.equal((await post({ role: 'admin' }, false)).status, 403);
  assert.equal(account.role, 'viewer');
  assert.equal((await post({ role: 'editor', chefId: 'invalid' })).status, 400);
  assert.equal((await post({ role: 'editor', chefId })).status, 200);
  assert.equal(account.role, 'editor'); assert.equal(account.chefId, chefId);
  assert.equal((await post({ role: 'admin', userId: 'some-other-user' })).status, 200);
  assert.equal(account.role, 'admin'); assert.equal(account.chefId, null);
});
