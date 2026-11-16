const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../server/src/app');
const { createDishService } = require('../server/src/services/dish-service');
const { createDishModel } = require('../server/src/models/dish-model');

const chef = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const otherChef = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const category = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const draft = () => ({ id, name: 'Dish', slug: 'dish', description: 'Original', categoryId: category, chefId: chef, price: '100', isPublished: false, isAvailable: true, isFeatured: false, ingredients: [] });
const input = { name: 'Dish', description: 'Updated', categoryId: category, price: '100', ingredientIds: [], isAvailable: true };

test('six authorization scenarios via Express with isolated in-memory records', async t => {
  let record = draft();
  let users = { viewer: { id: 'v', role: 'viewer' }, editor: { id: 'e', role: 'editor', chefId: chef }, admin: { id: 'a', role: 'admin' } };
  let race = null;
  const model = {
    async findById(value) { return value === id ? structuredClone(record) : null; },
    async findCategory(value) { return value === category ? { id: value } : null; },
    async findChef(value) { return [chef, otherChef].includes(value) ? { id: value } : null; },
    async findIngredients() { return []; },
    async findUnique() { return null; },
    async create(data) { record = { id, ...data }; return structuredClone(record); },
    async update(value, data, conditions) {
      if (race) { Object.assign(record, race); race = null; }
      if (conditions && (record.chefId !== conditions.chefId || record.isPublished !== conditions.isPublished)) throw Object.assign(new Error('missing'), { code: 'P2025' });
      record = { ...record, ...data }; return structuredClone(record);
    },
    async remove() { record = null; }
  };
  const services = { dishes: createDishService(model), admin: { async overview() { return {}; } }, reservations: { async upcoming() { return []; } } };
  const tokenSessions = { async findActiveCookieSession(token) { return users[token] ? { user: { ...users[token] }, sessionId: token } : null; } };
  const app = createApp({ services, tokenSessions, jwtConfig: { secret: 'x'.repeat(32), issuer: 'test', audience: 'test' }, csrfSecret: 'x'.repeat(32), trustedOrigins: ['http://localhost:5173'], secureCookies: false, disableAuthCleanup: true });
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve)); t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const csrfResponse = await fetch(`${base}/api/auth/csrf`);
  const csrf = (await csrfResponse.json()).data.csrfToken;
  const csrfCookie = csrfResponse.headers.getSetCookie()[0].split(';')[0];
  const call = (role, method, path = `/api/admin/dishes/${id}`, body) => fetch(base + path, { method, headers: { Cookie: `${role ? `bephoi.rt=${role}; ` : ''}${csrfCookie}`, Origin: 'http://localhost:5173', 'X-CSRF-Token': csrf, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const reset = () => { record = draft(); users.editor = { id: 'e', role: 'editor', chefId: chef }; };
  const forbidden = async response => { assert.equal(response.status, 403); assert.equal((await response.json()).error.code, 'FORBIDDEN'); };

  await t.test('1 missing session returns 401', async () => { assert.equal((await call('', 'GET')).status, 401); });
  await t.test('2 viewer create update delete denied without changes', async () => {
    reset(); const before = structuredClone(record);
    await forbidden(await call('viewer', 'POST', '/api/admin/dishes', input));
    await forbidden(await call('viewer', 'PATCH', undefined, input));
    await forbidden(await call('viewer', 'DELETE'));
    assert.deepEqual(record, before);
  });
  await t.test('3 editor cannot update another chef draft or own published dish', async () => {
    for (const change of [{ chefId: otherChef }, { isPublished: true }]) {
      reset(); Object.assign(record, change); const before = structuredClone(record);
      await forbidden(await call('editor', 'PATCH', undefined, input)); assert.deepEqual(record, before);
    }
  });
  await t.test('4 owner, status, and role changes after loading deny save', async () => {
    for (const change of [{ chefId: otherChef }, { isPublished: true }]) {
      reset(); assert.equal((await call('editor', 'GET')).status, 200); Object.assign(record, change); const before = structuredClone(record);
      await forbidden(await call('editor', 'PATCH', undefined, input)); assert.deepEqual(record, before);
    }
    reset(); assert.equal((await call('editor', 'GET')).status, 200); users.editor.role = 'viewer'; const before = structuredClone(record);
    await forbidden(await call('editor', 'PATCH', undefined, input)); assert.deepEqual(record, before);
  });
  await t.test('4 concurrent owner or status change between check and write', async () => {
    for (const change of [{ chefId: otherChef }, { isPublished: true }]) {
      reset(); race = change; await forbidden(await call('editor', 'PATCH', undefined, input));
      assert.equal(record.description, 'Original'); assert.deepEqual(Object.fromEntries(Object.keys(change).map(k => [k, record[k]])), change);
    }
  });
  await t.test('5 direct request allows only assigned draft and denies viewer', async () => {
    reset(); assert.equal((await call('editor', 'PATCH', undefined, input)).status, 200); assert.equal(record.description, 'Updated');
    const before = structuredClone(record); await forbidden(await call('viewer', 'PATCH', undefined, input)); assert.deepEqual(record, before);
  });
  await t.test('6 forged attributes cannot change ownership, status or role', async () => {
    reset(); const response = await call('editor', 'POST', '/api/admin/dishes', { ...input, role: 'admin', chefId: otherChef, isPublished: true, status: 'published' });
    assert.equal(response.status, 201); const created = (await response.json()).data; assert.equal(created.chefId, chef); assert.equal(created.isPublished, false); assert.equal(created.role, undefined);
    for (const forged of [{ role: 'admin', chefId: otherChef }, { status: 'published' }, { isPublished: true }]) {
      reset(); const before = structuredClone(record); await forbidden(await call('editor', 'PATCH', undefined, { ...input, ...forged })); assert.deepEqual(record, before);
    }
    reset(); const before = structuredClone(record); await forbidden(await call('viewer', 'PATCH', undefined, { ...input, role: 'admin' })); assert.deepEqual(record, before);
  });
});

test('dish model forwards ownership predicates to Prisma update', async () => {
  let args; const model = createDishModel({ dish: { async update(value) { args = value; return {}; } } });
  await model.update(id, { chefId: chef, categoryId: category, name: 'Dish', slug: 'dish', description: 'x', price: '1', ingredientIds: [], isPublished: false }, { chefId: chef, isPublished: false });
  assert.deepEqual(args.where, { id, chefId: chef, isPublished: false });
});
