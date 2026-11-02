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

function safeCategoryReturnTo(value, fallback = '/admin/categories') {
  return typeof value === 'string' && /^\/admin\/(?:dishes|categories)(?:\/|\?|$)/.test(value) ? value : fallback;
}

function safeResourceReturnTo(value, resource) {
  const fallback = `/admin/${resource}`;
  if (typeof value !== 'string' || !value.startsWith(`${fallback}?`)) return fallback;
  try {
    const destination = new URL(value, 'http://localhost');
    if (destination.pathname !== fallback) return fallback;
    destination.searchParams.delete('page');
    return destination.pathname + destination.search;
  } catch {
    return fallback;
  }
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
    const [formOptions, categoryManagerCategories] = await Promise.all([
      services.dishes.formOptions(),
      services.categories.list()
    ]);
    res.render('admin/dishes/form', {
      pageTitle: options.pageTitle || 'Món ăn — Quản trị Bếp Hội',
      heading: options.heading || 'Món ăn',
      formAction: options.formAction || '/admin/dishes',
      methodOverride: options.methodOverride || '',
      formData: options.formData || {},
      errors: options.errors || {},
      categories: formOptions.categories,
      ingredients: formOptions.ingredients,
      chefs: formOptions.chefs,
      categoryManagerCategories,
      categoryManagerReturnTo: options.categoryManagerReturnTo || (options.methodOverride ? `${options.formAction}/edit` : '/admin/dishes/new'),
      selectedIngredientIds: options.selectedIngredientIds || []
    });
  }

  async function renderCategoryList(res, options = {}) {
    const categories = await services.categories.list();
    return res.status(options.status || 200).render('admin/categories/index', {
      pageTitle: 'Danh mục món — Quản trị Bếp Hội',
      categories,
      editingCategory: options.editingCategory || null,
      formData: options.formData || {},
      errors: options.errors || {},
      notice: options.notice || ''
    });
  }

  async function renderChefForm(res, options = {}) {
    const { dishes } = await services.chefs.formOptions();
    res.render('admin/chefs/form', {
      pageTitle: options.pageTitle || 'Đầu bếp — Quản trị Bếp Hội',
      heading: options.heading || 'Đầu bếp',
      formAction: options.formAction || '/admin/chefs',
      methodOverride: options.methodOverride || '',
      formData: options.formData || {},
      errors: options.errors || {},
      dishes,
      selectedDishIds: options.selectedDishIds || []
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

    async categoryList(req, res) {
      const editingCategory = req.query.edit ? await services.categories.findById(req.query.edit) : null;
      if (req.query.edit && !editingCategory) throw new HttpError(404, 'Không tìm thấy danh mục.');
      return renderCategoryList(res, { editingCategory, formData: editingCategory || {} });
    },
    async categoryCreate(req, res) {
      try {
        await services.categories.create(req.body);
        return res.redirect(303, safeCategoryReturnTo(req.body.returnTo));
      } catch (error) {
        if (!(error instanceof ValidationError)) throw error;
        return renderCategoryList(res, { status: 400, formData: req.body, errors: error.errors });
      }
    },
    async categoryUpdate(req, res) {
      const id = requireId(req.params.id);
      const current = await services.categories.findById(id);
      if (!current) throw new HttpError(404, 'Không tìm thấy danh mục.');
      try {
        const category = await services.categories.update(id, req.body);
        if (!category) throw new HttpError(404, 'Không tìm thấy danh mục.');
        return res.redirect(303, safeCategoryReturnTo(req.body.returnTo));
      } catch (error) {
        if (!(error instanceof ValidationError)) throw error;
        return renderCategoryList(res, { status: 400, editingCategory: current, formData: req.body, errors: error.errors });
      }
    },
    async categoryDeleteConfirm(req, res) {
      const category = await services.categories.findById(requireId(req.params.id));
      if (!category) throw new HttpError(404, 'Danh mục không còn tồn tại.');
      return res.render('admin/categories/delete', { pageTitle: 'Xóa danh mục — Quản trị Bếp Hội', category, returnTo: safeCategoryReturnTo(req.query.returnTo) });
    },
    async categoryDelete(req, res) {
      const deleted = await services.categories.remove(requireId(req.params.id));
      if (!deleted) throw new HttpError(404, 'Danh mục không còn tồn tại.');
      return res.redirect(303, safeCategoryReturnTo(req.body.returnTo));
    },
    async dishList(req, res) {
      const result = await services.dishes.listAdmin(req.query);
      const categories = await services.categories.list();
      const filters = result.filters;
      const preserve = {
        q: result.q,
        categoryIds: filters.categoryIds.join(','),
        isPublished: filters.isPublished === undefined ? '' : String(filters.isPublished),
        isAvailable: filters.isAvailable === undefined ? '' : String(filters.isAvailable),
        isFeatured: filters.isFeatured === undefined ? '' : String(filters.isFeatured),
        minPrice: filters.minPrice,
        maxPrice: filters.maxPrice
      };
      const controls = createListControls('/admin/dishes', result, ['name', 'category', 'price', 'visibility', 'availability', 'updatedAt'], preserve);
      const dishUrl = (overrides = {}, remove = []) => {
        const values = { ...req.query };
        for (const key of remove) delete values[key];
        for (const [key, value] of Object.entries(overrides)) {
          if (value == null || value === '') delete values[key];
          else values[key] = value;
        }
        if (!Object.prototype.hasOwnProperty.call(overrides, 'page')) delete values.page;
        const params = new URLSearchParams();
        for (const [key, value] of Object.entries(values)) {
          for (const entry of Array.isArray(value) ? value : [value]) {
            if (typeof entry === 'string' || typeof entry === 'number' || typeof entry === 'boolean') params.append(key, String(entry));
          }
        }
        return '/admin/dishes' + (params.size ? '?' + params.toString() : '');
      };
      const filterChips = [
        ...filters.categoryIds.map((id) => ({ field: 'categoryIds', value: id, label: categories.find((category) => category.id === id)?.name || 'Danh mục' })),
        ...(filters.isPublished !== undefined ? [{ field: 'isPublished', label: filters.isPublished ? 'Công khai' : 'Bản nháp' }] : []),
        ...(filters.isAvailable !== undefined ? [{ field: 'isAvailable', label: filters.isAvailable ? 'Đang phục vụ' : 'Tạm hết' }] : []),
        ...(filters.isFeatured !== undefined ? [{ field: 'isFeatured', label: filters.isFeatured ? 'Món nổi bật' : 'Không nổi bật' }] : []),
        ...((filters.minPrice !== undefined || filters.maxPrice !== undefined) ? [{
          field: 'priceRange',
          label: filters.minPrice !== undefined && filters.maxPrice !== undefined
            ? `Giá: ${filters.minPrice} – ${filters.maxPrice} ₫`
            : filters.minPrice !== undefined ? `Giá từ ${filters.minPrice} ₫` : `Giá đến ${filters.maxPrice} ₫`
        }] : [])
      ];
      res.status(Object.keys(result.filterErrors || {}).length ? 400 : 200).render('admin/dishes/index', {
        pageTitle: 'Món ăn — Quản trị Bếp Hội', ...result, ...controls, categories, basePath: '/admin/dishes',
        dishUrl,
        returnTo: dishUrl(),
        filterChips,
        sortUrl: (sortBy) => dishUrl({ sortBy }),
        sortDirectionUrl: dishUrl({ sortDirection: result.sortDirection === 'asc' ? 'desc' : 'asc', page: '' }),
        removeFilterUrl: (chip) => chip.field === 'priceRange'
          ? dishUrl({ minPrice: '', maxPrice: '' })
          : chip.field === 'categoryIds'
            ? dishUrl({ categoryIds: filters.categoryIds.filter((id) => id !== chip.value).join(',') })
            : dishUrl({ [chip.field]: '' })
      });
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
      res.render('admin/dishes/delete', { pageTitle: `Xóa ${dish.name} — Quản trị Bếp Hội`, dish, returnTo: safeResourceReturnTo(req.query.returnTo, 'dishes') });
    },
    async dishDelete(req, res) {
      const id = requireId(req.params.id);
      const deleted = await services.dishes.remove(id);
      if (!deleted) throw new HttpError(404, 'Món ăn đã bị xóa hoặc không còn tồn tại.');
      res.redirect(303, safeResourceReturnTo(req.body.returnTo, 'dishes'));
    },

    async chefList(req, res) {
      const result = await services.chefs.listAdmin({ page: req.query.page, sortBy: req.query.sortBy, sortDirection: req.query.sortDirection, q: req.query.q });
      const controls = createListControls('/admin/chefs', result, ['name', 'title', 'specialty', 'sortOrder', 'visibility'], { q: result.q });
      const chefUrl = (overrides = {}) => {
        const params = new URLSearchParams();
        const values = { q: result.q, sortBy: result.sortBy, sortDirection: result.sortDirection, ...overrides };
        for (const [key, value] of Object.entries(values)) if (value) params.set(key, value);
        return '/admin/chefs' + (params.size ? `?${params}` : '');
      };
      res.render('admin/chefs/index', { pageTitle: 'Đầu bếp — Quản trị Bếp Hội', ...result, ...controls, basePath: '/admin/chefs', chefUrl });
    },
    async chefNew(_req, res) { return renderChefForm(res, { heading: 'Thêm đầu bếp', pageTitle: 'Thêm đầu bếp — Quản trị Bếp Hội' }); },
    async chefCreate(req, res) {
      const { data, errors } = validateChefInput(req.body);
      if (Object.keys(errors).length) {
        res.status(400);
        return renderChefForm(res, { heading: 'Thêm đầu bếp', formData: data, errors, selectedDishIds: data.dishIds });
      }
      try {
        const chef = await services.chefs.create(data);
        return res.redirect(303, '/admin/chefs/' + chef.id);
      } catch (error) {
        if (!(error instanceof ValidationError)) throw error;
        res.status(400);
        return renderChefForm(res, { heading: 'Thêm đầu bếp', formData: data, errors: error.errors, selectedDishIds: data.dishIds });
      }
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
        heading: 'Chỉnh sửa hồ sơ', pageTitle: 'Sửa ' + chef.name + ' — Quản trị Bếp Hội',
        formAction: '/admin/chefs/' + chef.id, methodOverride: 'PATCH', formData: chef,
        selectedDishIds: chef.dishes.map((dish) => dish.id)
      });
    },
    async chefUpdate(req, res) {
      const id = requireId(req.params.id);
      const { data, errors } = validateChefInput(req.body);
      if (Object.keys(errors).length) {
        res.status(400);
        return renderChefForm(res, {
          heading: 'Chỉnh sửa hồ sơ', formAction: '/admin/chefs/' + id, methodOverride: 'PATCH',
          formData: { ...data, id }, errors, selectedDishIds: data.dishIds
        });
      }
      try {
        const chef = await services.chefs.update(id, data);
        if (!chef) throw new HttpError(404, 'Không tìm thấy đầu bếp.');
        return res.redirect(303, '/admin/chefs/' + chef.id);
      } catch (error) {
        if (error instanceof HttpError) throw error;
        if (!(error instanceof ValidationError)) throw error;
        res.status(400);
        return renderChefForm(res, {
          heading: 'Chỉnh sửa hồ sơ', formAction: '/admin/chefs/' + id, methodOverride: 'PATCH',
          formData: { ...data, id }, errors: error.errors, selectedDishIds: data.dishIds
        });
      }
    },
    async chefDeleteConfirm(req, res) {
      const chef = await services.chefs.findById(requireId(req.params.id));
      if (!chef) throw new HttpError(404, 'Không tìm thấy đầu bếp.');
      res.render('admin/chefs/delete', { pageTitle: `Xóa ${chef.name} — Quản trị Bếp Hội`, chef, returnTo: safeResourceReturnTo(req.query.returnTo, 'chefs') });
    },
    async chefDelete(req, res) {
      const deleted = await services.chefs.remove(requireId(req.params.id));
      if (!deleted) throw new HttpError(404, 'Đầu bếp đã bị xóa hoặc không còn tồn tại.');
      res.redirect(303, safeResourceReturnTo(req.body.returnTo, 'chefs'));
    },

    async ingredientList(req, res) {
      const result = await services.ingredients.listAdmin({ page: req.query.page, sortBy: req.query.sortBy, sortDirection: req.query.sortDirection, q: req.query.q });
      const controls = createListControls('/admin/ingredients', result, ['name', 'usage'], { q: result.q });
      const ingredientUrl = (overrides = {}) => {
        const params = new URLSearchParams();
        const values = { q: result.q, sortBy: result.sortBy, sortDirection: result.sortDirection, ...overrides };
        for (const [key, value] of Object.entries(values)) if (value) params.set(key, value);
        return '/admin/ingredients' + (params.size ? `?${params}` : '');
      };
      res.render('admin/ingredients/index', { pageTitle: 'Nguyên liệu — Quản trị Bếp Hội', ...result, ...controls, basePath: '/admin/ingredients', ingredientUrl });
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
      res.render('admin/ingredients/delete', { pageTitle: `Xóa ${ingredient.name} — Quản trị Bếp Hội`, ingredient, inUse: false, returnTo: safeResourceReturnTo(req.query.returnTo, 'ingredients') });
    },
    async ingredientDelete(req, res) {
      const id = requireId(req.params.id);
      const removed = await services.ingredients.remove(id);
      if (!removed) throw new HttpError(404, 'Nguyên liệu không còn tồn tại.');
      if (removed === 'in-use') {
        const ingredient = await services.ingredients.findById(id);
        if (!ingredient) throw new HttpError(404, 'Nguyên liệu không còn tồn tại.');
        res.status(409);
        return res.render('admin/ingredients/delete', { pageTitle: `Xóa ${ingredient.name} — Quản trị Bếp Hội`, ingredient, inUse: true, returnTo: safeResourceReturnTo(req.body.returnTo, 'ingredients') });
      }
      return res.redirect(303, safeResourceReturnTo(req.body.returnTo, 'ingredients'));
    },

    async reservationList(req, res) {
      const filters = validateReservationFilters(req.query);
      const result = await services.reservations.listAdmin({ page: req.query.page, ...filters, sortBy: req.query.sortBy, sortDirection: req.query.sortDirection });
      const controls = createListControls('/admin/reservations', result, ['referenceCode', 'customerName', 'startsAt', 'guestCount', 'status'], filters);
      const clearFiltersQuery = new URLSearchParams({
        sortBy: result.sortBy || 'startsAt',
        sortDirection: result.sortDirection || 'desc'
      });
      const reservationUrl = () => {
        const params = new URLSearchParams();
        for (const [key, value] of Object.entries({ ...filters, sortBy: result.sortBy, sortDirection: result.sortDirection })) {
          if (value) params.set(key, value);
        }
        return '/admin/reservations' + (params.size ? `?${params}` : '');
      };
      res.render('admin/reservations/index', {
        pageTitle: 'Yêu cầu đặt bàn — Quản trị Bếp Hội', ...result, ...controls, basePath: '/admin/reservations', statuses: STATUSES,
        clearFiltersUrl: `/admin/reservations?${clearFiltersQuery}`, reservationUrl
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
      res.render('admin/reservations/delete', { pageTitle: `Xóa ${reservation.referenceCode} — Quản trị Bếp Hội`, reservation, returnTo: safeResourceReturnTo(req.query.returnTo, 'reservations') });
    },
    async reservationDelete(req, res) {
      const deleted = await services.reservations.remove(requireId(req.params.id));
      if (!deleted) throw new HttpError(404, 'Yêu cầu đặt bàn đã bị xóa hoặc không còn tồn tại.');
      res.redirect(303, safeResourceReturnTo(req.body.returnTo, 'reservations'));
    }
  };
}

module.exports = { createAdminController, reservationValues };
