require('dotenv').config();

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const request = require('supertest');
const { createApp } = require('../src/app');
const { getPrisma, disconnectPrisma } = require('../src/lib/prisma');
const { createServices } = require('../src/services');

function futureHcmDate(days = 5) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date(Date.now() + days * 24 * 60 * 60 * 1000));
  const value = Object.fromEntries(parts.map(({ type, value: part }) => [type, part]));
  return `${value.year}-${value.month}-${value.day}`;
}

test('configured PostgreSQL persists customer and admin workflows', {
  skip: !process.env.DATABASE_URL,
  timeout: 120000
}, async () => {
  const app = createApp();
  const prisma = getPrisma();
  const services = createServices(prisma);
  const suffix = crypto.randomBytes(4).toString('hex');
  let dishId;
  let chefId;
  let reservationId;

  try {
    const visibleDish = await prisma.dish.findFirst({ where: { isPublished: true }, select: { slug: true } });
    assert.ok(visibleDish, 'database has a published dish for the public detail route');
    for (const route of ['/', '/menu', `/dishes/${encodeURIComponent(visibleDish.slug)}`, '/chefs', '/reservations/new', '/admin', '/admin/dishes', '/admin/chefs', '/admin/reservations']) {
      assert.equal((await request(app).get(route)).status, 200, `GET ${route}`);
    }
    assert.equal((await request(app).get('/dishes/not-a-published-dish')).status, 404);
    assert.equal((await request(app).get('/admin/dishes/11111111-1111-4111-8111-111111111111')).status, 404);

    const { categories, ingredients } = await services.dishes.formOptions();
    const categoryId = categories[0].id;
    const ingredientIds = ingredients.slice(0, 3).map(({ id }) => id);
    const dish = await services.dishes.create({
      categoryId, name: `Món tích hợp ${suffix}`, description: 'Kiểm tra lưu món và nguyên liệu.', price: '45000',
      imageUrl: null, isPublished: true, isAvailable: true, isFeatured: false, ingredientIds: ingredientIds.slice(0, 1)
    });
    dishId = dish.id;
    const changedDish = await services.dishes.update(dish.id, {
      categoryId, name: dish.name, description: 'Đã cập nhật nguyên liệu.', price: '47000',
      imageUrl: null, isPublished: true, isAvailable: true, isFeatured: false, ingredientIds: ingredientIds.slice(1, 3)
    });
    assert.deepEqual(changedDish.ingredients.map((row) => row.ingredientId).sort(), ingredientIds.slice(1, 3).sort());

    const agent = request.agent(app);
    const editPage = await agent.get(`/admin/dishes/${dish.id}/edit`);
    const csrf = editPage.text.match(/name="_csrf" value="([a-f0-9]+)"/);
    assert.equal(editPage.status, 200);
    assert.ok(csrf, 'admin edit form includes a CSRF token');
    const patched = await agent.post(`/admin/dishes/${dish.id}`).type('form').send({
      _csrf: csrf[1], _method: 'PATCH', name: dish.name, categoryId,
      description: 'Ẩn khỏi thực đơn công khai.', price: '47000', imageUrl: '',
      ingredientIds: ingredientIds[2], isAvailable: 'on'
    });
    assert.equal(patched.status, 303, 'POST with _method=PATCH updates the dish');
    assert.equal((await request(app).get(`/dishes/${dish.slug}`)).status, 404, 'unpublished dish is hidden publicly');
    const deletePage = await agent.get(`/admin/dishes/${dish.id}/delete`);
    assert.equal(deletePage.status, 200);
    assert.ok(await services.dishes.findById(dish.id), 'GET delete confirmation does not mutate');
    const deleteToken = deletePage.text.match(/name="_csrf" value="([a-f0-9]+)"/);
    const deleted = await agent.post(`/admin/dishes/${dish.id}`).type('form').send({ _csrf: deleteToken[1], _method: 'DELETE' });
    assert.equal(deleted.status, 303, 'POST with _method=DELETE removes the dish');
    assert.equal(await services.dishes.findById(dish.id), null);

    const chef = await services.chefs.create({
      name: `Đầu bếp tích hợp ${suffix}`, title: 'Hồ sơ kiểm thử', bio: null,
      specialty: null, imageUrl: null, isPublished: false, sortOrder: 90
    });
    chefId = chef.id;
    const changedChef = await services.chefs.update(chef.id, { title: 'Đã cập nhật hồ sơ', sortOrder: 91 });
    assert.equal(changedChef.title, 'Đã cập nhật hồ sơ');
    assert.equal((await services.chefs.findById(chef.id)).sortOrder, 91);

    const reservationAgent = request.agent(app);
    const reservationForm = await reservationAgent.get('/reservations/new');
    const reservationCsrf = reservationForm.text.match(/name="_csrf" value="([a-f0-9]+)"/);
    assert.ok(reservationCsrf);
    const invalid = await reservationAgent.post('/reservations').type('form').send({
      _csrf: reservationCsrf[1], customerName: '', phone: '', date: '', time: '', guestCount: '0'
    });
    assert.equal(invalid.status, 400);
    const valid = await reservationAgent.post('/reservations').type('form').send({
      _csrf: reservationCsrf[1], customerName: `Khách tích hợp ${suffix}`, phone: '090 123 4567',
      email: '', date: futureHcmDate(), time: '19:00', guestCount: '2', customerNote: 'Yêu cầu kiểm thử.'
    });
    assert.equal(valid.status, 303);
    const confirmation = await reservationAgent.get('/reservations/new');
    const reference = confirmation.text.match(/Mã yêu cầu:\s*<strong>(BH-[A-Z0-9]+)<\/strong>/);
    assert.ok(reference, 'reservation reference is shown once after redirect');
    assert.doesNotMatch(confirmation.text, new RegExp(`Khách tích hợp ${suffix}`), 'customer details are not shown in the public confirmation');
    const oneTimeFlash = await reservationAgent.get('/reservations/new');
    assert.doesNotMatch(oneTimeFlash.text, new RegExp(reference[1]), 'reservation flash is one-time');

    const reservation = await prisma.reservation.findUnique({ where: { referenceCode: reference[1] } });
    assert.ok(reservation);
    reservationId = reservation.id;
    const confirmed = await services.reservations.update(reservation.id, {
      customerName: reservation.customerName, phone: reservation.phone, email: reservation.email,
      guestCount: reservation.guestCount, startsAt: reservation.startsAt, status: 'CONFIRMED',
      customerNote: reservation.customerNote, adminNote: 'Kiểm thử tích hợp.'
    });
    assert.equal(confirmed.reservation.status, 'CONFIRMED');
    const invalidTransition = await services.reservations.update(reservation.id, {
      customerName: reservation.customerName, phone: reservation.phone, email: reservation.email,
      guestCount: reservation.guestCount, startsAt: reservation.startsAt, status: 'COMPLETED',
      customerNote: reservation.customerNote, adminNote: 'Chuyển trạng thái không hợp lệ.'
    });
    assert.equal(invalidTransition.conflict, true);

    await services.chefs.remove(chef.id);
    chefId = null;
    console.log('PostgreSQL integration passed: SSR, CRUD, ingredient replacement, method override, CSRF, visibility, reservation, transitions, and 404s.');
  } finally {
    if (reservationId) await services.reservations.remove(reservationId);
    if (chefId) await services.chefs.remove(chefId);
    if (dishId) await services.dishes.remove(dishId);
    await disconnectPrisma();
  }
});
