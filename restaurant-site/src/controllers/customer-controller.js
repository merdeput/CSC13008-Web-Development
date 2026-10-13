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
      const categoryId = typeof req.query.category === 'string' ? req.query.category.trim().slice(0, 36) : '';
      const invalidCategoryId = Boolean(categoryId && !isUuid(categoryId));
      const [dishes, categories] = await Promise.all([
        invalidCategoryId ? [] : services.dishes.listPublic({ categoryId, q }),
        services.dishes.listCategories()
      ]);
      res.render('public/menu', {
        pageTitle: 'Thực đơn — Bếp Hội', dishes, categories, q, categoryId
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
