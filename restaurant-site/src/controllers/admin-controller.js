const { HttpError, ValidationError } = require('../lib/errors');
const { isUuid, STATUSES, validateDishInput, validateChefInput, validateIngredientInput, validateReservationInput, validateReservationFilters } = require('../services/validation');
const { createListControls } = require('../services/admin-list-sorting');
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

  async function renderIngredientForm(res, options = {}) {
    res.render('admin/ingredients/form', {
      pageTitle: options.pageTitle || 'Nguyên liệu — Quản trị Bếp Hội',
      heading: options.heading || 'Nguyên liệu',
      formAction: options.formAction || '/admin/ingredients',
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
      const result = await services.dishes.listAdmin({ page: req.query.page, sortBy: req.query.sortBy, sortDirection: req.query.sortDirection });
      const controls = createListControls('/admin/dishes', result, ['name', 'category', 'price', 'visibility', 'availability', 'updatedAt']);
      res.render('admin/dishes/index', { pageTitle: 'Món ăn — Quản trị Bếp Hội', ...result, ...controls, basePath: '/admin/dishes' });
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
      const result = await services.chefs.listAdmin({ page: req.query.page, sortBy: req.query.sortBy, sortDirection: req.query.sortDirection });
      const controls = createListControls('/admin/chefs', result, ['name', 'title', 'specialty', 'sortOrder', 'visibility']);
      res.render('admin/chefs/index', { pageTitle: 'Đầu bếp — Quản trị Bếp Hội', ...result, ...controls, basePath: '/admin/chefs' });
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

    async ingredientList(req, res) {
      const result = await services.ingredients.listAdmin({ page: req.query.page, sortBy: req.query.sortBy, sortDirection: req.query.sortDirection });
      const controls = createListControls('/admin/ingredients', result, ['name', 'usage']);
      res.render('admin/ingredients/index', { pageTitle: 'Nguyên liệu — Quản trị Bếp Hội', ...result, ...controls, basePath: '/admin/ingredients' });
    },
    async ingredientNew(_req, res) {
      return renderIngredientForm(res, { heading: 'Thêm nguyên liệu', pageTitle: 'Thêm nguyên liệu — Quản trị Bếp Hội' });
    },
    async ingredientCreate(req, res) {
      const { data, errors } = validateIngredientInput(req.body);
      if (Object.keys(errors).length) {
        res.status(400);
        return renderIngredientForm(res, { heading: 'Thêm nguyên liệu', formData: data, errors });
      }
      try {
        const ingredient = await services.ingredients.create(data);
        return res.redirect(303, `/admin/ingredients/${ingredient.id}`);
      } catch (error) {
        if (!(error instanceof ValidationError)) throw error;
        res.status(400);
        return renderIngredientForm(res, { heading: 'Thêm nguyên liệu', formData: data, errors: error.errors });
      }
    },
    async ingredientDetail(req, res) {
      const ingredient = await services.ingredients.findById(requireId(req.params.id));
      if (!ingredient) throw new HttpError(404, 'Không tìm thấy nguyên liệu.');
      res.render('admin/ingredients/show', { pageTitle: `${ingredient.name} — Quản trị Bếp Hội`, ingredient });
    },
    async ingredientEdit(req, res) {
      const ingredient = await services.ingredients.findById(requireId(req.params.id));
      if (!ingredient) throw new HttpError(404, 'Không tìm thấy nguyên liệu.');
      return renderIngredientForm(res, {
        heading: 'Chỉnh sửa nguyên liệu',
        pageTitle: `Sửa ${ingredient.name} — Quản trị Bếp Hội`,
        formAction: `/admin/ingredients/${ingredient.id}`,
        methodOverride: 'PATCH',
        formData: ingredient
      });
    },
    async ingredientUpdate(req, res) {
      const id = requireId(req.params.id);
      const { data, errors } = validateIngredientInput(req.body);
      if (Object.keys(errors).length) {
        res.status(400);
        return renderIngredientForm(res, {
          heading: 'Chỉnh sửa nguyên liệu', formAction: `/admin/ingredients/${id}`, methodOverride: 'PATCH', formData: data, errors
        });
      }
      try {
        const ingredient = await services.ingredients.update(id, data);
        if (!ingredient) throw new HttpError(404, 'Không tìm thấy nguyên liệu.');
        return res.redirect(303, `/admin/ingredients/${ingredient.id}`);
      } catch (error) {
        if (error instanceof HttpError) throw error;
        if (!(error instanceof ValidationError)) throw error;
        res.status(400);
        return renderIngredientForm(res, {
          heading: 'Chỉnh sửa nguyên liệu', formAction: `/admin/ingredients/${id}`, methodOverride: 'PATCH', formData: data, errors: error.errors
        });
      }
    },
    async ingredientDeleteConfirm(req, res) {
      const ingredient = await services.ingredients.findById(requireId(req.params.id));
      if (!ingredient) throw new HttpError(404, 'Không tìm thấy nguyên liệu.');
      res.render('admin/ingredients/delete', { pageTitle: `Xóa ${ingredient.name} — Quản trị Bếp Hội`, ingredient });
    },
    async ingredientDelete(req, res) {
      const id = requireId(req.params.id);
      const removed = await services.ingredients.remove(id);
      if (!removed) throw new HttpError(404, 'Nguyên liệu không còn tồn tại.');
      if (removed === 'in-use') {
        const ingredient = await services.ingredients.findById(id);
        if (!ingredient) throw new HttpError(404, 'Nguyên liệu không còn tồn tại.');
        res.status(409);
        return res.render('admin/ingredients/delete', { pageTitle: `Xóa ${ingredient.name} — Quản trị Bếp Hội`, ingredient, inUse: true });
      }
      return res.redirect(303, '/admin/ingredients');
    },

    async reservationList(req, res) {
      const filters = validateReservationFilters(req.query);
      const result = await services.reservations.listAdmin({ page: req.query.page, ...filters, sortBy: req.query.sortBy, sortDirection: req.query.sortDirection });
      const controls = createListControls('/admin/reservations', result, ['referenceCode', 'customerName', 'startsAt', 'guestCount', 'status'], filters);
      const clearFiltersQuery = new URLSearchParams({
        sortBy: result.sortBy || 'startsAt',
        sortDirection: result.sortDirection || 'desc'
      });
      res.render('admin/reservations/index', {
        pageTitle: 'Yêu cầu đặt bàn — Quản trị Bếp Hội', ...result, ...controls, basePath: '/admin/reservations', statuses: STATUSES,
        clearFiltersUrl: `/admin/reservations?${clearFiltersQuery}`
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
