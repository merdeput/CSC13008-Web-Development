const { HttpError } = require('../lib/errors');
const { isUuid, validateReservationInput } = require('../services/validation');
const { getRestaurantConfig } = require('../lib/restaurant-config');
const { todayInHcm } = require('../lib/format');

function createCustomerController(services) {
  return {
    async home(_req, res) {
      const [featuredDishes, chefs] = await Promise.all([
        services.dishes.listFeatured(4),
        services.chefs.listPublished(3)
      ]);
      res.render('public/home', { pageTitle: 'Bếp Hội — vị nhà bên sông Hoài', featuredDishes, chefs });
    },

    async menu(req, res) {
      const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
      const categoryId = typeof req.query.category === 'string' ? req.query.category.trim().slice(0, 36)
        : typeof req.query.categoryId === 'string' ? req.query.categoryId.trim().slice(0, 36) : '';
      const modes = ['combined', 'basic', 'advanced', 'fulltext', 'fuzzy'];
      const mode = typeof req.query.mode === 'string' && modes.includes(req.query.mode) ? req.query.mode : 'basic';
      const errors = {};
      const readNumber = (key, fallback, min, max) => {
        const raw = req.query[key];
        if (raw == null || raw === '') return fallback;
        const value = typeof raw === 'string' && /^\d+$/.test(raw) ? Number(raw) : NaN;
        if (!Number.isSafeInteger(value) || value < min || value > max) {
          errors[key] = 'Nhập số nguyên từ ' + min + ' đến ' + max + '.';
          return fallback;
        }
        return value;
      };
      const page = readNumber('page', 1, 1, 100000);
      const pageSize = readNumber('pageSize', 6, 1, 100);
      let minPrice;
      let maxPrice;
      let available;
      if (mode === 'advanced') {
        for (const field of ['minPrice', 'maxPrice']) {
          const raw = req.query[field];
          if (raw == null || raw === '') continue;
          const value = typeof raw === 'string' ? raw.trim() : '';
          if (!/^\d{1,12}$/.test(value)) errors[field] = 'Giá phải là số nguyên VND không âm, tối đa 12 chữ số.';
          else if (field === 'minPrice') minPrice = value;
          else maxPrice = value;
        }
        if (minPrice !== undefined && maxPrice !== undefined && Number(minPrice) > Number(maxPrice)) {
          errors.maxPrice = 'Giá tối đa phải bằng hoặc lớn hơn giá tối thiểu.';
          minPrice = undefined;
          maxPrice = undefined;
        }
        if (req.query.available === 'true') available = true;
        else if (req.query.available === 'false') available = false;
        else if (req.query.available != null && req.query.available !== '') errors.available = 'Trạng thái phục vụ không hợp lệ.';
      }
      const invalidCategoryId = Boolean(categoryId && !isUuid(categoryId));
      if (invalidCategoryId) errors.category = 'Vui lòng chọn danh mục hợp lệ.';
      const awaitingQuery = (mode === 'fulltext' || mode === 'fuzzy') && !q;
      const [result, categories] = await Promise.all([
        invalidCategoryId || awaitingQuery
          ? { items: [], total: 0, page, pageSize, pageCount: 1 }
          : services.dishes.listPublic({ categoryId, q, mode, minPrice, maxPrice, available, page, pageSize }),
        services.dishes.listCategories()
      ]);
      const view = ['pages', 'load-more', 'infinite'].includes(req.query.view) ? req.query.view : 'pages';
      const baseParams = { q, mode, category: categoryId, minPrice, maxPrice, available: available === undefined ? '' : String(available), pageSize, view };
      const menuUrl = (overrides = {}) => {
        const params = new URLSearchParams();
        for (const [key, value] of Object.entries({ ...baseParams, ...overrides })) {
          if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
        }
        return '/menu?' + params.toString();
      };
      if (req.query.fragment === '1') {
        return res.render('public/menu-items', {
          layout: false, dishes: result.items, startIndex: (result.page - 1) * result.pageSize,
          page: result.page, pageCount: result.pageCount, total: result.total
        });
      }
      res.render('public/menu', {
        pageTitle: 'Thực đơn — Bếp Hội', dishes: result.items, categories, q, categoryId,
        mode, minPrice: minPrice || '', maxPrice: maxPrice || '', available: available === undefined ? '' : String(available),
        page: result.page, pageSize: result.pageSize, pageCount: result.pageCount, total: result.total,
        view, awaitingQuery, errors, menuUrl
      });
    },

    async dishDetail(req, res) {
      if (!isUuid(req.params.id)) throw new HttpError(404, 'Món ăn này không tồn tại hoặc chưa được giới thiệu công khai.');
      const dish = await services.dishes.findPublicById(req.params.id);
      if (!dish) throw new HttpError(404, 'Món ăn này không tồn tại hoặc chưa được giới thiệu công khai.');
      res.render('public/dish-detail', { pageTitle: `${dish.name} — Bếp Hội`, dish });
    },

    async chefs(_req, res) {
      const chefs = await services.chefs.listPublished();
      res.render('public/chefs', { pageTitle: 'Bếp trưởng — Bếp Hội', chefs });
    },

    reservationForm(req, res) {
      const flash = req.session.flash && req.session.flash.reservation;
      if (req.session.flash) delete req.session.flash.reservation;
      res.render('public/reservation-new', {
        pageTitle: 'Gửi yêu cầu đặt bàn — Bếp Hội',
        formData: {},
        errors: {},
        flash,
        config: getRestaurantConfig(),
        minDate: todayInHcm()
      });
    },

    async createReservation(req, res) {
      const { data, errors } = validateReservationInput(req.body);
      if (Object.keys(errors).length) {
        return res.status(400).render('public/reservation-new', {
          pageTitle: 'Gửi yêu cầu đặt bàn — Bếp Hội',
          formData: data,
          errors,
          config: getRestaurantConfig(),
          minDate: todayInHcm()
        });
      }
      const reservation = await services.reservations.create(data);
      req.session.flash = { reservation: { referenceCode: reservation.referenceCode } };
      return res.redirect(303, '/reservations/new');
    }
  };
}

module.exports = { createCustomerController };
