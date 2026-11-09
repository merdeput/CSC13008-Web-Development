const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const expressSession = require('express-session');
const { promisify } = require('node:util');
const request = require('supertest');
const { createApp } = require('../src/app');
const { PrismaSessionStore } = require('../src/lib/prisma-session-store');
const { createDishService } = require('../src/services/dish-service');
const { createAuthService } = require('../src/services/auth-service');
const { canTransition } = require('../src/services/reservation-service');
const { parseReservationDateTime, validateReservationInput } = require('../src/services/validation');
const { formatDateTimeHcm } = require('../src/lib/format');

const categoryId = '291550bb-0084-4f33-805e-26637edff8c6';
const ingredientId = 'f0a04e5c-fc92-4897-9cb4-a5d0a893c0f7';
const secondIngredientId = 'c1cf927e-c17a-4ce6-bec1-976e034b9602';
const dishId = '143bf0e8-7c88-4ecb-8da5-b901cb082cac';
const chefId = '81f7350b-9af3-4564-88bc-0d38a728a59e';
const reservationId = '0ac6032d-0681-480e-a667-9f38f9049762';
const testAdminId = '6cb91747-b711-48c1-885c-4190b08ea211';
const testAdminEmail = 'admin@example.test';
const testAdminPassword = 'Test-Admin-Password-123';
const registeredUserId = '10f852de-8ad7-4a2d-994a-dce5802bf9a1';
const registeredEmail = 'new-user@example.test';
const registeredPassword = 'New-User-Password-123';
const resetToken = 'test-reset-token-with-enough-entropy-1234567890';

process.env.NODE_ENV = 'test';
process.env.RECAPTCHA_SITE_KEY = 'test-site-key';
process.env.RECAPTCHA_SECRET_KEY = 'test-recaptcha-secret';
process.env.RECAPTCHA_ALLOWED_HOSTNAMES = '127.0.0.1,localhost';
process.env.OTP_HMAC_SECRET = 'test-otp-hmac-secret-123456789012';
process.env.LOGIN_COUNTER_HMAC_SECRET = 'test-login-counter-secret-123456789';
process.env.RESEND_API_KEY = 'test-resend-api-key';
process.env.EMAIL_FROM = 'Bep Hoi <noreply@example.test>';
process.env.PUBLIC_BASE_URL = 'http://localhost:3000';

const category = { id: categoryId, name: 'Món nước', slug: 'mon-nuoc', sortOrder: 1 };
const ingredients = [
  { id: ingredientId, name: 'Bánh cao lầu' },
  { id: secondIngredientId, name: 'Rau thơm' }
];

function makeDish(overrides = {}) {
  return {
    id: dishId, categoryId, category, name: 'Cao lầu Hội An', slug: 'cao-lau-hoi-an',
    description: 'Sợi mì dai, thịt xá xíu và rau thơm.', price: '89000', imageUrl: null,
    isPublished: true, isAvailable: true, isFeatured: true,
    createdAt: new Date('2026-01-01T10:00:00Z'), updatedAt: new Date('2026-01-01T10:00:00Z'),
    ingredients: [{ dishId, ingredientId, ingredient: ingredients[0] }],
    ...overrides
  };
}

function makeChef(overrides = {}) {
  return {
    id: chefId, name: 'Trần Minh An', title: 'Bếp trưởng điều hành',
    bio: 'Giữ lửa căn bếp.', specialty: 'Món Hội An', imageUrl: null,
    isPublished: true, sortOrder: 1, dishes: [],
    createdAt: new Date('2026-01-01T10:00:00Z'), updatedAt: new Date('2026-01-01T10:00:00Z'),
    ...overrides
  };
}

function futureLocalDate(days = 4) {
  const target = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(target);
  const result = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${result.year}-${result.month}-${result.day}`;
}

function makeServices() {
  const dishes = [makeDish()];
  const chefs = [makeChef()];
  const reservations = [{
    id: reservationId, referenceCode: 'BH-4B81C0D2', customerName: 'Lê Minh', phone: '090 123 4567',
    email: null, guestCount: 2, startsAt: parseReservationDateTime(futureLocalDate(), '19:00'),
    status: 'PENDING', customerNote: null, adminNote: null,
    createdAt: new Date(), updatedAt: new Date()
  }];
  let lastDishUpdate;
  let deleteCalls = 0;
  const authUsers = new Map([[testAdminEmail, {
    id: testAdminId, email: testAdminEmail, password: testAdminPassword,
    role: 'viewer', status: 'ACTIVE', emailVerifiedAt: new Date()
  }]]);
  const authState = {
    authUsers, registrationInput: null, loginAttempts: 0, resetCompleted: false,
    resendResult: { status: 'sent' }, registrationDeliveryErrorCode: null
  };
  const adminFilters = {
    categoryIds: [], isPublished: undefined, isAvailable: undefined, isFeatured: undefined,
    minPrice: undefined, maxPrice: undefined
  };
  return {
    state: { dishes, chefs, reservations, auth: authState, get lastDishUpdate() { return lastDishUpdate; }, get deleteCalls() { return deleteCalls; } },
    services: {
      dishes: {
        listFeatured: async () => dishes.filter((dish) => dish.isFeatured && dish.isPublished),
        listPublic: async ({ categoryId: filterCategoryId, q, page = 1, pageSize = 6 } = {}) => {
          const items = dishes.filter((dish) => dish.isPublished &&
            (!filterCategoryId || dish.categoryId === filterCategoryId) && (!q || `${dish.name} ${dish.description}`.toLowerCase().includes(q.toLowerCase())));
          return { items, total: items.length, page, pageSize, pageCount: 1 };
        },
        listCategories: async () => [category],
        findPublicById: async (id) => dishes.find((dish) => dish.id === id && dish.isPublished) || null,
        listAdmin: async ({ page = 1 } = {}) => ({
          items: dishes, total: dishes.length, page: Number(page) || 1, pageCount: 1,
          sortBy: 'updatedAt', sortDirection: 'desc', q: '', filters: adminFilters, filterErrors: {}
        }),
        findById: async (id) => dishes.find((dish) => dish.id === id) || null,
        formOptions: async () => ({ categories: [category], ingredients, chefs }),
        create: async (data) => {
          const dish = makeDish({
            ...data, id: crypto.randomUUID(), slug: data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
            category, ingredients: data.ingredientIds.map((id) => ({ dishId: 'new', ingredientId: id, ingredient: ingredients.find((item) => item.id === id) })),
            createdAt: new Date(), updatedAt: new Date()
          });
          dishes.push(dish);
          return dish;
        },
        update: async (id, data) => {
          const index = dishes.findIndex((dish) => dish.id === id);
          if (index < 0) return null;
          lastDishUpdate = data;
          dishes[index] = makeDish({ ...dishes[index], ...data, category, updatedAt: new Date(), ingredients: data.ingredientIds.map((id) => ({ dishId: id, ingredientId: id, ingredient: ingredients.find((item) => item.id === id) })) });
          return dishes[index];
        },
        remove: async (id) => {
          const index = dishes.findIndex((dish) => dish.id === id);
          if (index < 0) return false;
          deleteCalls += 1;
          dishes.splice(index, 1);
          return true;
        }
      },
      chefs: {
        listPublished: async () => chefs.filter((chef) => chef.isPublished),
        formOptions: async () => ({ dishes }),
        listAdmin: async ({ page = 1 } = {}) => ({ items: chefs, total: chefs.length, page: Number(page) || 1, pageCount: 1 }),
        findById: async (id) => chefs.find((chef) => chef.id === id) || null,
        create: async (data) => { const chef = makeChef({ ...data, id: crypto.randomUUID() }); chefs.push(chef); return chef; },
        update: async (id, data) => { const index = chefs.findIndex((chef) => chef.id === id); if (index < 0) return null; chefs[index] = { ...chefs[index], ...data }; return chefs[index]; },
        remove: async (id) => { const index = chefs.findIndex((chef) => chef.id === id); if (index < 0) return false; chefs.splice(index, 1); return true; }
      },
      reservations: {
        create: async (data) => {
          const reservation = { ...data, id: crypto.randomUUID(), referenceCode: 'BH-TEST-001', status: 'PENDING', createdAt: new Date(), updatedAt: new Date() };
          reservations.push(reservation);
          return reservation;
        },
        update: async (id, data) => {
          const reservation = reservations.find((item) => item.id === id);
          if (!reservation) return null;
          if (!canTransition(reservation.status, data.status)) return { conflict: true, current: reservation };
          Object.assign(reservation, data, { updatedAt: new Date() });
          return { reservation };
        },
        listAdmin: async ({ page = 1, status = '', from = '', to = '' } = {}) => ({ items: reservations.filter((item) => !status || item.status === status), total: reservations.length, page: Number(page) || 1, pageCount: 1, filters: { status, from, to } }),
        findById: async (id) => reservations.find((item) => item.id === id) || null,
        upcoming: async () => reservations.filter((item) => ['PENDING', 'CONFIRMED'].includes(item.status)),
        count: async () => reservations.length,
        remove: async (id) => { const index = reservations.findIndex((item) => item.id === id); if (index < 0) return false; reservations.splice(index, 1); return true; }
      },
      categories: {
        list: async () => [category],
        findById: async (id) => id === categoryId ? category : null
      },
      ingredients: { list: async () => ingredients },
      admin: { overview: async () => ({ dishCount: dishes.length, chefCount: chefs.length, reservationCount: reservations.length }) },
      auth: {
        authenticate: async (email, password) => {
          authState.loginAttempts += 1;
          const user = authUsers.get(email);
          return user && user.status === 'ACTIVE' && user.emailVerifiedAt && user.password === password
            ? { id: user.id, email: user.email, role: user.role, status: user.status }
            : null;
        },
        findById: async (id) => [...authUsers.values()].find((user) => user.id === id) || null,
        beginRegistration: async (input) => {
          authState.registrationInput = input;
          authUsers.set(input.email, {
            id: registeredUserId, email: input.email, password: registeredPassword,
            role: 'viewer', status: 'PENDING', emailVerifiedAt: null
          });
          return {
            userId: registeredUserId, created: true,
            ...(authState.registrationDeliveryErrorCode ? { deliveryErrorCode: authState.registrationDeliveryErrorCode } : {})
          };
        },
        activateAccount: async (id, code) => {
          const user = [...authUsers.values()].find((item) => item.id === id);
          if (!user || user.status !== 'PENDING' || code !== '123456') return { status: 'invalid' };
          user.status = 'ACTIVE';
          user.emailVerifiedAt = new Date();
          return { status: 'activated' };
        },
        resendActivationCode: async () => authState.resendResult,
        getLoginLockout: async () => ({ locked: false }),
        recordLoginFailure: async () => {},
        clearLoginFailures: async () => {},
        requestPasswordReset: async () => ({ queued: true }),
        isPasswordResetTokenValid: async (token) => token === resetToken,
        completePasswordReset: async (token, password) => {
          if (token !== resetToken) return false;
          const user = authUsers.get(testAdminEmail);
          user.password = password;
          authState.resetCompleted = true;
          return true;
        }
      }
    }
  };
}

function createTestApp(services, verifyRecaptcha = async () => true) {
  return createApp({
    services,
    sessionStore: new expressSession.MemoryStore(),
    verifyRecaptcha
  });
}

async function csrfToken(agent, path) {
  const response = await agent.get(path);
  assert.equal(response.status, 200);
  const match = response.text.match(/name="_csrf" value="([a-f0-9]+)"/);
  assert.ok(match, `CSRF token was not rendered on ${path}`);
  return match[1];
}

async function authenticatedAgent(app) {
  const agent = request.agent(app);
  const token = await csrfToken(agent, '/login');
  const response = await agent.post('/login').type('form').send({
    _csrf: token,
    email: testAdminEmail,
    password: testAdminPassword,
    returnTo: '/admin',
    'g-recaptcha-response': 'test-token'
  });
  assert.equal(response.status, 303);
  assert.equal(response.headers.location, '/admin');
  return agent;
}

test('customer and admin SSR pages render in Vietnamese without authentication', async () => {
  const { services } = makeServices();
  const app = createTestApp(services);
  const home = await request(app).get('/');
  assert.equal(home.status, 200);
  assert.match(home.text, /VỊ NHÀ/);
  assert.match(home.text, /Cao lầu Hội An/);

  const admin = await request(app).get('/admin');
  assert.equal(admin.status, 303);
  assert.equal(admin.headers.location, '/login?returnTo=%2Fadmin');
  const signedIn = await authenticatedAgent(app);
  assert.equal((await signedIn.get('/admin')).status, 200);
});

test('admin middleware rechecks that the session user remains active and verified', async () => {
  const { services, state } = makeServices();
  const app = createTestApp(services);
  const agent = await authenticatedAgent(app);
  state.auth.authUsers.get(testAdminEmail).status = 'PENDING';
  const rejected = await agent.get('/admin');
  assert.equal(rejected.status, 303);
  assert.equal(rejected.headers.location, '/login');
});

test('registration creates a pending viewer, blocks pending login, and activation does not sign in', async () => {
  const { services, state } = makeServices();
  const app = createTestApp(services);
  const agent = request.agent(app);
  const weakPasswordToken = await csrfToken(agent, '/register');
  const weakPassword = await agent.post('/register').type('form').send({
    _csrf: weakPasswordToken, email: registeredEmail, password: 'twelve characters!4',
    'g-recaptcha-response': 'test-token'
  });
  assert.equal(weakPassword.status, 400);
  assert.match(weakPassword.text, /một chữ hoa/);
  assert.equal(state.auth.authUsers.has(registeredEmail), false);

  const registerToken = await csrfToken(agent, '/register');
  const registered = await agent.post('/register').type('form').send({
    _csrf: registerToken, email: registeredEmail, password: registeredPassword,
    role: 'admin', 'g-recaptcha-response': 'test-token'
  });
  assert.equal(registered.status, 200);
  assert.equal(state.auth.authUsers.get(registeredEmail).status, 'PENDING');
  assert.equal(state.auth.authUsers.get(registeredEmail).role, 'viewer');
  assert.equal(Object.hasOwn(state.auth.registrationInput, 'role'), false);

  const loginToken = await csrfToken(agent, '/login');
  const pendingLogin = await agent.post('/login').type('form').send({
    _csrf: loginToken, email: registeredEmail, password: registeredPassword,
    'g-recaptcha-response': 'test-token'
  });
  assert.equal(pendingLogin.status, 401);

  state.auth.resendResult = { status: 'limit' };
  const resendToken = await csrfToken(agent, '/activate');
  const limitedResend = await agent.post('/activate/resend').type('form').send({
    _csrf: resendToken, 'g-recaptcha-response': 'test-token'
  });
  assert.equal(limitedResend.status, 429);

  const activationToken = await csrfToken(agent, '/activate');
  const activated = await agent.post('/activate').type('form').send({ _csrf: activationToken, code: '123456' });
  assert.equal(activated.status, 303);
  assert.equal(activated.headers.location, '/login?activated=1');
  assert.equal((await agent.get('/admin')).status, 303, 'activation does not create an authenticated session');

  const postActivationLoginToken = await csrfToken(agent, '/login');
  const loggedIn = await agent.post('/login').type('form').send({
    _csrf: postActivationLoginToken, email: registeredEmail, password: registeredPassword,
    'g-recaptcha-response': 'test-token'
  });
  assert.equal(loggedIn.status, 303);
  assert.equal(loggedIn.headers.location, '/admin');
});

test('registration and login reject failed server-side CAPTCHA verification', async () => {
  const { services, state } = makeServices();
  const app = createTestApp(services, async () => false);
  const agent = request.agent(app);
  let token = await csrfToken(agent, '/register');
  const registration = await agent.post('/register').type('form').send({
    _csrf: token, email: registeredEmail, password: registeredPassword, 'g-recaptcha-response': 'bad-token'
  });
  assert.equal(registration.status, 400);
  assert.equal(state.auth.registrationInput, null);

  token = await csrfToken(agent, '/login');
  const login = await agent.post('/login').type('form').send({
    _csrf: token, email: testAdminEmail, password: testAdminPassword, 'g-recaptcha-response': 'bad-token'
  });
  assert.equal(login.status, 400);
  assert.equal(state.auth.loginAttempts, 0, 'failed CAPTCHA does not reach credential verification');
});

test('email provider rejection keeps registration generic and leaves activation recoverable', async () => {
  const { services, state } = makeServices();
  state.auth.registrationDeliveryErrorCode = 'EMAIL_PROVIDER_HTTP_403';
  const app = createTestApp(services);
  const agent = request.agent(app);
  const token = await csrfToken(agent, '/register');
  const response = await agent.post('/register').type('form').send({
    _csrf: token, email: registeredEmail, password: registeredPassword, 'g-recaptcha-response': 'test-token'
  });
  assert.equal(response.status, 200);
  assert.doesNotMatch(response.text, /EMAIL_PROVIDER_HTTP_403/);
  assert.equal((await agent.get('/activate')).status, 200);
});

test('all admin CRUD route methods redirect unauthenticated requests with 303', async () => {
  const { services } = makeServices();
  const app = createTestApp(services);
  const routes = [
    ['get', '/admin'],
    ['get', '/admin/categories'], ['post', '/admin/categories'], ['patch', '/admin/categories/11111111-1111-4111-8111-111111111111'], ['get', '/admin/categories/11111111-1111-4111-8111-111111111111/delete'], ['delete', '/admin/categories/11111111-1111-4111-8111-111111111111'],
    ['get', '/admin/dishes'], ['get', '/admin/dishes/new'], ['post', '/admin/dishes'], ['get', '/admin/dishes/11111111-1111-4111-8111-111111111111'], ['get', '/admin/dishes/11111111-1111-4111-8111-111111111111/edit'], ['patch', '/admin/dishes/11111111-1111-4111-8111-111111111111'], ['get', '/admin/dishes/11111111-1111-4111-8111-111111111111/delete'], ['delete', '/admin/dishes/11111111-1111-4111-8111-111111111111'],
    ['get', '/admin/chefs'], ['get', '/admin/chefs/new'], ['post', '/admin/chefs'], ['get', '/admin/chefs/11111111-1111-4111-8111-111111111111'], ['get', '/admin/chefs/11111111-1111-4111-8111-111111111111/edit'], ['patch', '/admin/chefs/11111111-1111-4111-8111-111111111111'], ['get', '/admin/chefs/11111111-1111-4111-8111-111111111111/delete'], ['delete', '/admin/chefs/11111111-1111-4111-8111-111111111111'],
    ['get', '/admin/ingredients'], ['get', '/admin/ingredients/new'], ['post', '/admin/ingredients'], ['get', '/admin/ingredients/11111111-1111-4111-8111-111111111111/edit'], ['patch', '/admin/ingredients/11111111-1111-4111-8111-111111111111'], ['get', '/admin/ingredients/11111111-1111-4111-8111-111111111111/delete'], ['delete', '/admin/ingredients/11111111-1111-4111-8111-111111111111'], ['get', '/admin/ingredients/11111111-1111-4111-8111-111111111111'],
    ['get', '/admin/reservations'], ['get', '/admin/reservations/11111111-1111-4111-8111-111111111111'], ['get', '/admin/reservations/11111111-1111-4111-8111-111111111111/edit'], ['patch', '/admin/reservations/11111111-1111-4111-8111-111111111111'], ['get', '/admin/reservations/11111111-1111-4111-8111-111111111111/delete'], ['delete', '/admin/reservations/11111111-1111-4111-8111-111111111111']
  ];
  for (const [method, path] of routes) {
    const response = await request(app)[method](path);
    assert.equal(response.status, 303, `${method.toUpperCase()} ${path}`);
    assert.match(response.headers.location, /^\/login\?returnTo=/);
  }
});

test('POST logout destroys the stored session and rejects replay of its old cookie', async () => {
  const { services } = makeServices();
  const app = createTestApp(services);
  const agent = request.agent(app);
  const loginPage = await agent.get('/login');
  const loginCsrf = loginPage.text.match(/name="_csrf" value="([a-f0-9]+)"/);
  assert.ok(loginCsrf);
  const preAuthCookie = loginPage.headers['set-cookie'].find((value) => value.startsWith('bephoi.sid='));
  assert.ok(preAuthCookie);
  const login = await agent.post('/login').type('form').send({
    _csrf: loginCsrf[1], email: testAdminEmail, password: testAdminPassword,
    'g-recaptcha-response': 'test-token'
  });
  assert.equal(login.status, 303);
  const oldCookie = login.headers['set-cookie'].find((value) => value.startsWith('bephoi.sid='));
  assert.ok(oldCookie);
  assert.notEqual(preAuthCookie.split(';')[0], oldCookie.split(';')[0], 'login rotates the session identifier');
  assert.equal((await request(app).get('/admin').set('Cookie', preAuthCookie.split(';')[0])).status, 303);

  const logoutToken = await csrfToken(agent, '/');
  const logout = await agent.post('/logout').type('form').send({ _csrf: logoutToken });
  assert.equal(logout.status, 303);
  assert.equal(logout.headers.location, '/');
  assert.match(logout.headers['set-cookie'].join(';'), /Expires=Thu, 01 Jan 1970/i);

  const replay = await request(app).get('/admin').set('Cookie', oldCookie.split(';')[0]);
  assert.equal(replay.status, 303);
});

test('PostgreSQL session adapter stores userId and reloads the session from the shared store', async () => {
  const records = new Map();
  const db = { session: {
    findUnique: async ({ where }) => records.get(where.sid) || null,
    upsert: async ({ where, create, update }) => {
      records.set(where.sid, { ...(records.get(where.sid) || create), ...update, ...(!records.has(where.sid) ? create : {}) });
    },
    deleteMany: async ({ where }) => {
      const existed = records.delete(where.sid);
      return { count: existed ? 1 : 0 };
    }
  } };
  const firstProcessStore = new PrismaSessionStore(db, { pruneIntervalMs: 60_000 });
  const sessionData = { userId: testAdminId, cookie: { expires: new Date(Date.now() + 60_000), maxAge: 60_000 } };
  await promisify(firstProcessStore.set.bind(firstProcessStore))('persistent-session-id', sessionData);
  firstProcessStore.close();
  assert.equal(records.get('persistent-session-id').userId, testAdminId);

  const restartedProcessStore = new PrismaSessionStore(db, { pruneIntervalMs: 60_000 });
  const loaded = await promisify(restartedProcessStore.get.bind(restartedProcessStore))('persistent-session-id');
  assert.equal(loaded.userId, testAdminId);
  await promisify(restartedProcessStore.destroy.bind(restartedProcessStore))('persistent-session-id');
  assert.equal(await promisify(restartedProcessStore.get.bind(restartedProcessStore))('persistent-session-id'), null);
  restartedProcessStore.close();
});

test('persistent login lockout honors lockedUntil independently of the failure window', async () => {
  const email = 'locked@example.test';
  const ip = '203.0.113.25';
  const keyHash = (type, value) => crypto.createHmac('sha256', process.env.LOGIN_COUNTER_HMAC_SECRET)
    .update(`${type}:${value}`).digest('hex');
  const counters = [
    { keyType: 'EMAIL', keyHash: keyHash('EMAIL', email), failureCount: 10, windowStartedAt: new Date(Date.now() - 16 * 60_000), lockedUntil: new Date(Date.now() + 60_000) },
    { keyType: 'IP', keyHash: keyHash('IP', ip), failureCount: 10, windowStartedAt: new Date(Date.now() - 16 * 60_000), lockedUntil: new Date(Date.now() + 60_000) }
  ];
  const auth = createAuthService({ loginFailureCounter: {
    findMany: async ({ where }) => counters.filter((counter) => where.OR.some((key) => key.keyType === counter.keyType && key.keyHash === counter.keyHash))
  } });

  assert.equal((await auth.getLoginLockout(email, ip)).locked, true);
  counters.forEach((counter) => { counter.lockedUntil = null; });
  assert.equal((await auth.getLoginLockout(email, ip)).locked, false, 'expired windows stop blocking after lockedUntil elapses');
});

test('password reset routes use a generic request response and consume a valid reset token', async () => {
  const { services, state } = makeServices();
  const app = createTestApp(services);
  const agent = request.agent(app);
  const requestToken = await csrfToken(agent, '/password-reset');
  const requested = await agent.post('/password-reset').type('form').send({
    _csrf: requestToken, email: testAdminEmail, 'g-recaptcha-response': 'test-token'
  });
  assert.equal(requested.status, 200);
  assert.match(requested.text, /role="status"/);
  assert.doesNotMatch(requested.text, new RegExp(testAdminEmail));

  const confirmPath = `/password-reset/confirm?token=${encodeURIComponent(resetToken)}`;
  const confirmToken = await csrfToken(agent, confirmPath);
  const completed = await agent.post('/password-reset/confirm').type('form').send({
    _csrf: confirmToken, token: resetToken, password: 'New-Reset-Password-123'
  });
  assert.equal(completed.status, 303);
  assert.equal(completed.headers.location, '/login?reset=1');
  assert.equal(state.auth.resetCompleted, true);
});

test('public dish navigation and category filters use IDs', async () => {
  const { services } = makeServices();
  const app = createTestApp(services);
  const menu = await request(app).get(`/menu?q=cao%20l%E1%BA%A7u&category=${categoryId}`);
  assert.equal(menu.status, 200);
  assert.match(menu.text, /Cao lầu Hội An/);
  assert.equal((await request(app).get(`/dishes/${dishId}`)).status, 200);
  assert.equal((await request(app).get('/dishes/cao-lau-hoi-an')).status, 404);
});

test('reservation form validates, creates a pending request and shows a one-time reference after 303', async () => {
  const { services, state } = makeServices();
  const app = createTestApp(services);
  const agent = request.agent(app);
  const token = await csrfToken(agent, '/reservations/new');
  const date = futureLocalDate();

  const invalid = await agent.post('/reservations').type('form').send({ _csrf: token, customerName: '', phone: 'x', date, time: '08:00', guestCount: '0' });
  assert.equal(invalid.status, 400);
  assert.match(invalid.text, /Vui lòng nhập họ tên/);
  assert.equal(state.reservations.length, 1);

  const valid = await agent.post('/reservations').type('form').send({
    _csrf: token, customerName: 'Nguyễn An', phone: '090 222 3344', email: '', date,
    time: '19:00', guestCount: '3', customerNote: 'Có một bé nhỏ.'
  });
  assert.equal(valid.status, 303);
  assert.equal(valid.headers.location, '/reservations/new');
  assert.equal(state.reservations.at(-1).status, 'PENDING');
  const confirmation = await agent.get('/reservations/new');
  assert.match(confirmation.text, /BH-TEST-001/);
  assert.match(confirmation.text, /đang chờ nhà hàng xác nhận/i);
  assert.doesNotMatch(confirmation.text, /Nguyễn An/);
  const nextVisit = await agent.get('/reservations/new');
  assert.doesNotMatch(nextVisit.text, /BH-TEST-001/);
});

test('admin dish mutation uses POST method override, replaces ingredients and persists in service state', async () => {
  const { services, state } = makeServices();
  const app = createTestApp(services);
  const agent = await authenticatedAgent(app);
  const token = await csrfToken(agent, `/admin/dishes/${dishId}/edit`);

  const response = await agent.post(`/admin/dishes/${dishId}`).type('form').send({
    _csrf: token, _method: 'PATCH', name: 'Cao lầu nhà Hội', categoryId,
    description: 'Mì Hội An với rau thơm.', price: '91000', imageUrl: '',
    isPublished: 'on', isAvailable: 'on', ingredientIds: [secondIngredientId]
  });
  assert.equal(response.status, 303);
  assert.equal(response.headers.location, `/admin/dishes/${dishId}`);
  assert.deepEqual(state.lastDishUpdate.ingredientIds, [secondIngredientId]);
  assert.equal((await agent.get(`/admin/dishes/${dishId}`)).status, 200);
  assert.match((await agent.get(`/admin/dishes/${dishId}`)).text, /Cao lầu nhà Hội/);
});

test('admin can create a dish and its detail page shows the saved ingredient choices', async () => {
  const { services, state } = makeServices();
  const app = createTestApp(services);
  const agent = await authenticatedAgent(app);
  const token = await csrfToken(agent, '/admin/dishes/new');
  const created = await agent.post('/admin/dishes').type('form').send({
    _csrf: token, name: 'Gỏi cuốn vườn nhà', categoryId,
    description: 'Cuốn rau xanh, tôm và bún tươi.', price: '68000', imageUrl: '',
    isPublished: 'on', isAvailable: 'on', ingredientIds: [ingredientId, secondIngredientId]
  });
  assert.equal(created.status, 303);
  const createdId = created.headers.location.split('/').at(-1);
  assert.equal(state.dishes.length, 2);
  const detail = await agent.get(created.headers.location);
  assert.equal(detail.status, 200);
  assert.match(detail.text, /Gỏi cuốn vườn nhà/);
  assert.match(detail.text, /Bánh cao lầu/);
  assert.match(detail.text, /Rau thơm/);
  assert.equal((await agent.get(`/dishes/${createdId}`)).status, 200);
});

test('admin chef create, update, and delete pages persist the edited profile', async () => {
  const { services, state } = makeServices();
  const app = createTestApp(services);
  const agent = await authenticatedAgent(app);
  const createToken = await csrfToken(agent, '/admin/chefs/new');
  const created = await agent.post('/admin/chefs').type('form').send({
    _csrf: createToken, name: 'Phạm Thu Hà', title: 'Bếp phó', specialty: 'Món chay',
    bio: 'Chăm chút rau củ theo mùa.', imageUrl: '', sortOrder: '2', isPublished: 'on'
  });
  assert.equal(created.status, 303);
  const chefPath = created.headers.location;
  const chef = state.chefs.find((item) => `/admin/chefs/${item.id}` === chefPath);
  assert.ok(chef);

  const updateToken = await csrfToken(agent, `${chefPath}/edit`);
  const updated = await agent.post(chefPath).type('form').send({
    _csrf: updateToken, _method: 'PATCH', name: 'Phạm Thu Hà', title: 'Bếp trưởng món chay',
    specialty: 'Món chay theo mùa', bio: 'Chăm chút rau củ theo mùa.', imageUrl: '', sortOrder: '2', isPublished: 'on'
  });
  assert.equal(updated.status, 303);
  assert.match((await agent.get(chefPath)).text, /Bếp trưởng món chay/);

  assert.equal((await agent.get(`${chefPath}/delete`)).status, 200);
  const deleteToken = await csrfToken(agent, `${chefPath}/delete`);
  const deleted = await agent.post(chefPath).type('form').send({ _csrf: deleteToken, _method: 'DELETE' });
  assert.equal(deleted.status, 303);
  assert.equal(state.chefs.some((item) => item.id === chef.id), false);
});

test('GET delete confirmation never mutates, while POST DELETE requires CSRF and removes', async () => {
  const { services, state } = makeServices();
  const app = createTestApp(services);
  const agent = await authenticatedAgent(app);
  const token = await csrfToken(agent, `/admin/dishes/${dishId}/delete`);
  assert.equal((await agent.get(`/admin/dishes/${dishId}/delete?_method=DELETE`)).status, 200);
  assert.equal(state.deleteCalls, 0);
  assert.equal((await agent.post(`/admin/dishes/${dishId}`).type('form').send({ _method: 'DELETE' })).status, 403);
  const deleted = await agent.post(`/admin/dishes/${dishId}`).type('form').send({ _csrf: token, _method: 'DELETE' });
  assert.equal(deleted.status, 303);
  assert.equal(state.deleteCalls, 1);
  assert.equal((await agent.get(`/admin/dishes/${dishId}`)).status, 404);
});

test('missing reservation IDs return 404 and admin edits enforce state transitions', async () => {
  const { services, state } = makeServices();
  const app = createTestApp(services);
  const agent = await authenticatedAgent(app);
  const missingId = 'b37be910-c88c-441e-b085-4ebfd912f307';
  assert.equal((await agent.get(`/admin/reservations/${missingId}`)).status, 404);

  const token = await csrfToken(agent, `/admin/reservations/${reservationId}/edit`);
  const date = futureLocalDate();
  const confirmed = await agent.post(`/admin/reservations/${reservationId}`).type('form').send({
    _csrf: token, _method: 'PATCH', customerName: 'Lê Minh', phone: '090 123 4567', email: '',
    guestCount: '2', date, time: '19:00', status: 'CONFIRMED', customerNote: '', adminNote: 'Đã gọi.'
  });
  assert.equal(confirmed.status, 303);
  assert.equal(state.reservations[0].status, 'CONFIRMED');
  const seated = await agent.post(`/admin/reservations/${reservationId}`).type('form').send({
    _csrf: token, _method: 'PATCH', customerName: 'Lê Minh', phone: '090 123 4567', email: '',
    guestCount: '2', date, time: '19:00', status: 'COMPLETED', customerNote: '', adminNote: ''
  });
  assert.equal(seated.status, 400);
  assert.match(seated.text, /không thể chuyển/i);
});

test('Vietnamese reservation time converts to a timezone-aware instant and opening defaults apply', () => {
  const instant = parseReservationDateTime('2026-03-08', '19:30');
  assert.equal(instant.toISOString(), '2026-03-08T12:30:00.000Z');
  assert.match(formatDateTimeHcm(instant), /19:30/);
  const invalid = validateReservationInput({
    customerName: 'Nguyễn An', phone: '0901234567', guestCount: '2', date: futureLocalDate(), time: '09:00'
  });
  assert.ok(invalid.errors.time);
});

test('reservation status transitions allow only the requested lifecycle', () => {
  assert.equal(canTransition('PENDING', 'CONFIRMED'), true);
  assert.equal(canTransition('PENDING', 'CANCELLED'), true);
  assert.equal(canTransition('CONFIRMED', 'SEATED'), true);
  assert.equal(canTransition('CONFIRMED', 'NO_SHOW'), true);
  assert.equal(canTransition('SEATED', 'COMPLETED'), true);
  assert.equal(canTransition('PENDING', 'SEATED'), false);
  assert.equal(canTransition('COMPLETED', 'PENDING'), false);
  assert.equal(canTransition('CANCELLED', 'CONFIRMED'), false);
});

test('dish updates run in one Prisma transaction and replace ingredient associations atomically', async () => {
  let transactional = false;
  let updateArgs;
  const current = { id: dishId, name: 'Cao lầu Hội An', slug: 'cao-lau-hoi-an' };
  const db = {
    category: { findUnique: async () => ({ id: categoryId }) },
    ingredient: { findMany: async ({ where }) => ingredients.filter((item) => where.id.in.includes(item.id)) },
    dish: {
      findUnique: async () => current,
      update: async (args) => { updateArgs = args; return { ...current, ...args.data }; }
    },
    $transaction: async (callback) => { transactional = true; return callback(db); }
  };
  const service = createDishService(db);
  await service.update(dishId, {
    categoryId, name: 'Cao lầu Hội An', description: 'Mì và rau.', price: '90000', imageUrl: null,
    isPublished: true, isAvailable: true, isFeatured: false, ingredientIds: [secondIngredientId]
  });
  assert.equal(transactional, true);
  assert.deepEqual(updateArgs.data.ingredients.deleteMany, {});
  assert.deepEqual(updateArgs.data.ingredients.create, [{ ingredient: { connect: { id: secondIngredientId } } }]);
});
