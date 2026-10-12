const { HttpError, ValidationError } = require('../lib/errors');
const { isUuid, STATUSES, validateDishInput, validateChefInput, validateReservationInput, validateReservationFilters } = require('../services/validation');
const { getRestaurantConfig } = require('../lib/restaurant-config');
const { toHcmDateTimeLocal, todayInHcm } = require('../lib/format');
const { TRANSITIONS } = require('../services/reservation-service');

function requireId(value) {
  if (!isUuid(value)) throw new HttpError(404, 'Không tìm thấy dữ liệu cần thao tác.');
  return value;
}

function reservationValues(reservation = {}) {
  const local = reservation.startsAt ? toHcmDateTimeLocal(reservation.startsAt) : '';
  return {
    customerName: reservation.customerName || '',
    phone: reservation.phone || '',
    email: reservation.email || '',
    guestCount: reservation.guestCount == null ? '' : String(reservation.guestCount),
    date: local.slice(0, 10),
    time: local.slice(11, 16),
    status: reservation.status || 'PENDING',
    customerNote: reservation.customerNote || '',
    adminNote: reservation.adminNote || ''
  };
}

function createAdminController(services) {
  async function renderDishForm(res, options = {}) {
    const formOptions = await services.dishes.formOptions();
    res.render('admin/dishes/form', {
      pageTitle: options.pageTitle || 'Món ăn — Quản trị Bếp Hội',
      heading: options.heading || 'Món ăn',
      formAction: options.formAction || '/admin/dishes',
      methodOverride: options.methodOverride || '',
      formData: options.formData || {},
      errors: options.errors || {},
      categories: formOptions.categories,
      ingredients: formOptions.ingredients,
      selectedIngredientIds: options.selectedIngredientIds || []
    });
  }

  async function renderChefForm(res, options = {}) {
    res.render('admin/chefs/form', {
      pageTitle: options.pageTitle || 'Đầu bếp — Quản trị Bếp Hội',
      heading: options.heading || 'Đầu bếp',
      formAction: options.formAction || '/admin/chefs',
      methodOverride: options.methodOverride || '',
      formData: options.formData || {},
      errors: options.errors || {}
    });
  }

  async function renderReservationEdit(res, reservation, options = {}) {
    res.render('admin/reservations/form', {
      pageTitle: 'Cập nhật yêu cầu — Quản trị Bếp Hội',
      reservation,
      formData: options.formData || reservationValues(reservation),
      errors: options.errors || {},
      formAction: `/admin/reservations/${reservation.id}`,
      statusOptions: [reservation.status, ...(TRANSITIONS[reservation.status] || [])].filter((status, index, all) => all.indexOf(status) === index),
      statuses: STATUSES
    });
  }

  return {
    async overview(_req, res) {
      const [counts, upcoming] = await Promise.all([
        services.admin.overview(), services.reservations.upcoming(8)
      ]);
      res.render('admin/dashboard', { pageTitle: 'Tổng quan — Quản trị Bếp Hội', counts, upcoming });
    },

    async dishList(req, res) {
      const result = await services.dishes.listAdmin({ page: req.query.page });
      res.render('admin/dishes/index', { pageTitle: 'Món ăn — Quản trị Bếp Hội', ...result, basePath: '/admin/dishes' });
    },
    async dishNew(_req, res) { return renderDishForm(res, { heading: 'Thêm món ăn', pageTitle: 'Thêm món — Quản trị Bếp Hội' }); },
    async dishCreate(req, res) {
      const { data, errors } = validateDishInput(req.body);
      if (Object.keys(errors).length) {
        res.status(400);
        return renderDishForm(res, { heading: 'Thêm món ăn', formData: data, errors, selectedIngredientIds: data.ingredientIds });
      }
      try {
        const dish = await services.dishes.create(data);
        return res.redirect(303, `/admin/dishes/${dish.id}`);
      } catch (error) {
        if (!(error instanceof ValidationError)) throw error;
        res.status(400);
        return renderDishForm(res, { heading: 'Thêm món ăn', formData: data, errors: error.errors, selectedIngredientIds: data.ingredientIds });
      }
    },
    async dishDetail(req, res) {
      const dish = await services.dishes.findById(requireId(req.params.id));
      if (!dish) throw new HttpError(404, 'Không tìm thấy món ăn.');
      res.render('admin/dishes/show', { pageTitle: `${dish.name} — Quản trị Bếp Hội`, dish });
    },
    async dishEdit(req, res) {
      const dish = await services.dishes.findById(requireId(req.params.id));
      if (!dish) throw new HttpError(404, 'Không tìm thấy món ăn.');
      const selectedIngredientIds = dish.ingredients.map((item) => item.ingredientId);
      return renderDishForm(res, {
        heading: 'Chỉnh sửa món ăn', pageTitle: `Sửa ${dish.name} — Quản trị Bếp Hội`,
        formAction: `/admin/dishes/${dish.id}`, methodOverride: 'PATCH', formData: dish,
        selectedIngredientIds
      });
    },
    async dishUpdate(req, res) {
      const id = requireId(req.params.id);
      const { data, errors } = validateDishInput(req.body);
      if (Object.keys(errors).length) {
        res.status(400);
        return renderDishForm(res, {
          heading: 'Chỉnh sửa món ăn', formAction: `/admin/dishes/${id}`, methodOverride: 'PATCH',
          formData: data, errors, selectedIngredientIds: data.ingredientIds
        });
      }
      try {
        const dish = await services.dishes.update(id, data);
        if (!dish) throw new HttpError(404, 'Không tìm thấy món ăn.');
        return res.redirect(303, `/admin/dishes/${dish.id}`);
      } catch (error) {
        if (error instanceof HttpError) throw error;
        if (!(error instanceof ValidationError)) throw error;
        res.status(400);
        return renderDishForm(res, {
          heading: 'Chỉnh sửa món ăn', formAction: `/admin/dishes/${id}`, methodOverride: 'PATCH',
          formData: data, errors: error.errors, selectedIngredientIds: data.ingredientIds
        });
      }
    },
    async dishDeleteConfirm(req, res) {
      const dish = await services.dishes.findById(requireId(req.params.id));
      if (!dish) throw new HttpError(404, 'Không tìm thấy món ăn.');
      res.render('admin/dishes/delete', { pageTitle: `Xóa ${dish.name} — Quản trị Bếp Hội`, dish });
    },
    async dishDelete(req, res) {
      const id = requireId(req.params.id);
      const deleted = await services.dishes.remove(id);
      if (!deleted) throw new HttpError(404, 'Món ăn đã bị xóa hoặc không còn tồn tại.');
      res.redirect(303, '/admin/dishes');
    },

    async chefList(req, res) {
      const result = await services.chefs.listAdmin({ page: req.query.page });
      res.render('admin/chefs/index', { pageTitle: 'Đầu bếp — Quản trị Bếp Hội', ...result, basePath: '/admin/chefs' });
    },
    async chefNew(_req, res) { return renderChefForm(res, { heading: 'Thêm đầu bếp', pageTitle: 'Thêm đầu bếp — Quản trị Bếp Hội' }); },
    async chefCreate(req, res) {
      const { data, errors } = validateChefInput(req.body);
      if (Object.keys(errors).length) {
        res.status(400);
        return renderChefForm(res, { heading: 'Thêm đầu bếp', formData: data, errors });
      }
      const chef = await services.chefs.create(data);
      res.redirect(303, `/admin/chefs/${chef.id}`);
    },
    async chefDetail(req, res) {
      const chef = await services.chefs.findById(requireId(req.params.id));
      if (!chef) throw new HttpError(404, 'Không tìm thấy đầu bếp.');
      res.render('admin/chefs/show', { pageTitle: `${chef.name} — Quản trị Bếp Hội`, chef });
    },
    async chefEdit(req, res) {
      const chef = await services.chefs.findById(requireId(req.params.id));
      if (!chef) throw new HttpError(404, 'Không tìm thấy đầu bếp.');
      return renderChefForm(res, {
        heading: 'Chỉnh sửa hồ sơ', pageTitle: `Sửa ${chef.name} — Quản trị Bếp Hội`,
        formAction: `/admin/chefs/${chef.id}`, methodOverride: 'PATCH', formData: chef
      });
    },
    async chefUpdate(req, res) {
      const id = requireId(req.params.id);
      const { data, errors } = validateChefInput(req.body);
      if (Object.keys(errors).length) {
        res.status(400);
        return renderChefForm(res, {
          heading: 'Chỉnh sửa hồ sơ', formAction: `/admin/chefs/${id}`, methodOverride: 'PATCH', formData: data, errors
        });
      }
      const chef = await services.chefs.update(id, data);
      if (!chef) throw new HttpError(404, 'Không tìm thấy đầu bếp.');
      res.redirect(303, `/admin/chefs/${chef.id}`);
    },
    async chefDeleteConfirm(req, res) {
      const chef = await services.chefs.findById(requireId(req.params.id));
      if (!chef) throw new HttpError(404, 'Không tìm thấy đầu bếp.');
      res.render('admin/chefs/delete', { pageTitle: `Xóa ${chef.name} — Quản trị Bếp Hội`, chef });
    },
    async chefDelete(req, res) {
      const deleted = await services.chefs.remove(requireId(req.params.id));
      if (!deleted) throw new HttpError(404, 'Đầu bếp đã bị xóa hoặc không còn tồn tại.');
      res.redirect(303, '/admin/chefs');
    },

    async reservationList(req, res) {
      const filters = validateReservationFilters(req.query);
      const result = await services.reservations.listAdmin({ page: req.query.page, ...filters });
      const paginationQuery = new URLSearchParams(Object.entries(filters).filter(([, value]) => value)).toString();
      res.render('admin/reservations/index', {
        pageTitle: 'Yêu cầu đặt bàn — Quản trị Bếp Hội', ...result, basePath: '/admin/reservations', statuses: STATUSES, paginationQuery
      });
    },
    async reservationDetail(req, res) {
      const reservation = await services.reservations.findById(requireId(req.params.id));
      if (!reservation) throw new HttpError(404, 'Không tìm thấy yêu cầu đặt bàn.');
      res.render('admin/reservations/show', { pageTitle: `Mã ${reservation.referenceCode} — Quản trị Bếp Hội`, reservation });
    },
    async reservationEdit(req, res) {
      const reservation = await services.reservations.findById(requireId(req.params.id));
      if (!reservation) throw new HttpError(404, 'Không tìm thấy yêu cầu đặt bàn.');
      return renderReservationEdit(res, reservation);
    },
    async reservationUpdate(req, res) {
      const id = requireId(req.params.id);
      const reservation = await services.reservations.findById(id);
      if (!reservation) throw new HttpError(404, 'Không tìm thấy yêu cầu đặt bàn.');
      const { data, errors } = validateReservationInput(req.body, { admin: true });
      if (Object.keys(errors).length) {
        res.status(400);
        return renderReservationEdit(res, reservation, { formData: data, errors });
      }
      const result = await services.reservations.update(id, data);
      if (!result) throw new HttpError(404, 'Không tìm thấy yêu cầu đặt bàn.');
      if (result.conflict) {
        res.status(400);
        return renderReservationEdit(res, result.current || reservation, {
          formData: data,
          errors: { status: 'Trạng thái đã thay đổi hoặc không thể chuyển sang trạng thái này.' }
        });
      }
      res.redirect(303, `/admin/reservations/${id}`);
    },
    async reservationDeleteConfirm(req, res) {
      const reservation = await services.reservations.findById(requireId(req.params.id));
      if (!reservation) throw new HttpError(404, 'Không tìm thấy yêu cầu đặt bàn.');
      res.render('admin/reservations/delete', { pageTitle: `Xóa ${reservation.referenceCode} — Quản trị Bếp Hội`, reservation });
    },
    async reservationDelete(req, res) {
      const deleted = await services.reservations.remove(requireId(req.params.id));
      if (!deleted) throw new HttpError(404, 'Yêu cầu đặt bàn đã bị xóa hoặc không còn tồn tại.');
      res.redirect(303, '/admin/reservations');
    }
  };
}

module.exports = { createAdminController, reservationValues };
