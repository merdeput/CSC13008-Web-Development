const { HttpError } = require('../lib/errors');
const { getRestaurantConfig } = require('../lib/restaurant-config');
const { isUuid } = require('../services/validation');

const NOT_FOUND_MESSAGE = 'Dữ liệu không khả dụng.';

function createPublicHandlers(services) {
  return {
    async home(_req, res) {
      const [dishes, chefs] = await Promise.all([services.dishes.listFeatured(4), services.chefs.listPublished()]);
      return res.json({ ok: true, data: { dishes, chefs: chefs.slice(0, 3) } });
    },
    async menu(req, res) {
      const categoryId = typeof req.query.categoryId === 'string' ? req.query.categoryId.trim() : '';
      const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
      const page = typeof req.query.page === 'string' ? req.query.page : '1';
      const pageSize = req.query.pageSize === undefined ? undefined : req.query.pageSize;
      const [result, categories] = await Promise.all([services.dishes.listPublic({ categoryId, q, page, pageSize }), services.dishes.listCategories()]);
      return res.json({ ok: true, data: { ...result, categories } });
    },
    async dish(req, res) {
      if (!isUuid(req.params.id)) throw new HttpError(404, NOT_FOUND_MESSAGE);
      const dish = await services.dishes.findPublicById(req.params.id);
      if (!dish) throw new HttpError(404, NOT_FOUND_MESSAGE);
      return res.json({ ok: true, data: dish });
    },
    async chefs(_req, res) {
      const chefs = await services.chefs.listPublished();
      return res.json({ ok: true, data: { items: chefs, total: chefs.length } });
    },
    async createReservation(req, res) {
      const reservation = await services.reservations.create(req.body || {});
      return res.status(201).json({ ok: true, data: { id: reservation.id, referenceCode: reservation.referenceCode, status: reservation.status } });
    },
    config(_req, res) { return res.json({ ok: true, data: getRestaurantConfig() }); }
  };
}

module.exports = { createPublicHandlers };
