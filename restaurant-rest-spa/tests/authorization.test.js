const test = require('node:test');
const assert = require('node:assert/strict');
const { authorize } = require('../server/src/middleware/authorize');
const { createDishService } = require('../server/src/services/dish-service');
const chefId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const otherChef = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const categoryId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
function decision(role, method, path, body = {}, chef = chefId) {
  const req = { method, path, body, auth: { user: { role, chefId: chef } } };
  let status = 200;
  const res = { status(value) { status = value; return this; }, json() {} };
  authorize(req, res, () => {});
  return { status, body: req.body };
}
test('role permissions and forged fields', () => {
  for (const role of ['viewer', 'editor', 'admin']) assert.equal(decision(role, 'GET', '/dishes').status, 200);
  assert.equal(decision('unknown', 'GET', '/dishes').status, 403);
  assert.equal(decision('viewer', 'POST', '/dishes').status, 403);
  assert.equal(decision('editor', 'DELETE', '/dishes/a').status, 403);
  assert.equal(decision('editor', 'PATCH', '/categories/a').status, 403);
  assert.equal(decision('admin', 'DELETE', '/dishes/a').status, 200);
  assert.equal(decision('editor', 'POST', '/dishes', {}, null).status, 403);
  assert.deepEqual(decision('editor', 'POST', '/dishes', { chefId: otherChef, isPublished: true }).body, { chefId, isPublished: false });
  for (const body of [{ chefId: otherChef }, { isPublished: true }, { status: 'published' }]) assert.equal(decision('editor', 'PATCH', '/dishes/a', body).status, 403);
  assert.equal(decision('editor', 'POST', '/chefs', { dishIds: [otherChef] }).status, 403);
});
test('editor updates only an assigned draft and writes with atomic predicates', async () => {
  let current = { chefId, isPublished: false, name: 'Dish', slug: 'dish' };
  let writes = 0; let conditions;
  const model = { async findById() { return current; }, async findCategory() { return {}; }, async findChef() { return {}; }, async findIngredients() { return []; }, async update(id, data, where) { writes++; conditions = where; return data; } };
  const service = createDishService(model);
  const input = { name: 'Dish', description: 'Description', categoryId, price: '1', ingredientIds: [] };
  const user = { role: 'editor', chefId };
  await service.update('dish-id', input, user);
  assert.deepEqual(conditions, { chefId, isPublished: false });
  current = { ...current, chefId: otherChef };
  await assert.rejects(service.update('dish-id', input, user), { status: 403 });
  current = { ...current, chefId, isPublished: true };
  await assert.rejects(service.update('dish-id', input, user), { status: 403 });
  assert.equal(writes, 1);
});

test('direct admin requests enforce cookie identity, CSRF and denied writes', async (t) => {
  const { createApp } = require('../server/src/app');
  let writes = 0;
  const users = { viewer: { role: 'viewer' }, editor: { role: 'editor', chefId }, admin: { role: 'admin' }, unknown: { role: 'unknown' } };
  const services = { dishes: { async create(data) { writes++; return data; } }, admin: { async overview() { return {}; } }, reservations: { async upcoming() { return []; } } };
  const tokenSessions = { async findActiveCookieSession(token) { return users[token] ? { user: users[token] } : null; } };
  const app = createApp({ services, tokenSessions, jwtConfig: { secret: 'x'.repeat(32), issuer: 'test', audience: 'test' }, csrfSecret: 'x'.repeat(32), trustedOrigins: ['http://localhost:5173'], secureCookies: false, disableAuthCleanup: true });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const csrfResponse = await fetch(`${base}/api/auth/csrf`);
  const csrf = (await csrfResponse.json()).data.csrfToken;
  const csrfCookie = csrfResponse.headers.getSetCookie()[0].split(';')[0];
  const call = (role, method = 'GET', body) => fetch(`${base}/api/admin/dishes`, { method, headers: { Cookie: `bephoi.rt=${role}; ${csrfCookie}`, Origin: 'http://localhost:5173', 'X-CSRF-Token': csrf, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  assert.equal((await call('invalid')).status, 401);
  assert.equal((await call('unknown')).status, 403);
  assert.equal((await call('viewer', 'POST', {})).status, 403);
  assert.equal(writes, 0);
  const created = await call('editor', 'POST', { chefId: otherChef, isPublished: true });
  assert.equal(created.status, 201);
  assert.equal((await created.json()).data.chefId, chefId);
  assert.equal(writes, 1);
});
