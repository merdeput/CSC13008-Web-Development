const { HttpError, ValidationError, isPrismaCode, isUniqueFieldError } = require('../lib/errors');
const { uniqueSlug } = require('../lib/slug');
const { isUuid, validateDishInput } = require('./validation');

const NOT_FOUND_MESSAGE = 'Dữ liệu không khả dụng.';
const MAX_DISH_PRICE = 999999999999;

function parseAdminDishFilters(query = {}) {
  const errors = {};
  const rawCategoryIds = query.categoryIds ?? query.categoryId;
  const categoryValues = rawCategoryIds == null ? [] : Array.isArray(rawCategoryIds) ? rawCategoryIds : [rawCategoryIds];
  const categoryIds = [];
  for (const value of categoryValues) {
    if (typeof value !== 'string') {
      errors.categoryIds = 'Danh mục không hợp lệ.';
      continue;
    }
    categoryIds.push(...value.split(',').map((id) => id.trim()).filter(Boolean));
  }
  const uniqueCategoryIds = [...new Set(categoryIds)];
  if (uniqueCategoryIds.length > 100 || uniqueCategoryIds.some((id) => !isUuid(id))) {
    errors.categoryIds = 'Danh mục không hợp lệ.';
  }

  function optionalBoolean(field) {
    const value = query[field];
    if (value == null || value === '') return undefined;
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    errors[field] = 'Giá trị lọc không hợp lệ.';
    return undefined;
  }

  function optionalPrice(field) {
    const value = query[field];
    if (value == null || value === '') return undefined;
    const text = typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
    const price = Number(text);
    if (!/^\d{1,12}$/.test(text) || !Number.isSafeInteger(price) || price > MAX_DISH_PRICE) {
      errors[field] = 'Giá phải là số nguyên từ 0 đến 999.999.999.999 đồng.';
      return undefined;
    }
    return text;
  }

  const isPublished = optionalBoolean('isPublished');
  const isAvailable = optionalBoolean('isAvailable');
  const isFeatured = optionalBoolean('isFeatured');
  const minPrice = optionalPrice('minPrice');
  const maxPrice = optionalPrice('maxPrice');
  if (minPrice !== undefined && maxPrice !== undefined && Number(minPrice) > Number(maxPrice)) {
    errors.maxPrice = 'Giá tối đa phải bằng hoặc lớn hơn giá tối thiểu.';
  }
  if (Object.keys(errors).length) throw new ValidationError(errors);

  return { categoryIds: uniqueCategoryIds, isPublished, isAvailable, isFeatured, minPrice, maxPrice };
}

function createDishService(model) {
  async function validateReferences(data) {
    if (!isUuid(data.categoryId) || (data.chefId && !isUuid(data.chefId)) || data.ingredientIds.some((id) => !isUuid(id))) {
      throw new HttpError(404, NOT_FOUND_MESSAGE);
    }
    const [category, chef, ingredients] = await Promise.all([
      model.findCategory(data.categoryId),
      data.chefId ? model.findChef(data.chefId) : Promise.resolve(true),
      data.ingredientIds.length ? model.findIngredients(data.ingredientIds) : Promise.resolve([])
    ]);
    if (!category || !chef || ingredients.length !== data.ingredientIds.length) throw new HttpError(404, NOT_FOUND_MESSAGE);
  }

  async function checked(input) {
    if (input.categoryId && !isUuid(String(input.categoryId))) throw new HttpError(404, NOT_FOUND_MESSAGE);
    if (input.chefId && !isUuid(String(input.chefId))) throw new HttpError(404, NOT_FOUND_MESSAGE);
    if (input.ingredientIds != null) {
      const values = Array.isArray(input.ingredientIds) ? input.ingredientIds : [input.ingredientIds];
      if (values.some((id) => typeof id !== 'string' || !isUuid(id))) throw new HttpError(404, NOT_FOUND_MESSAGE);
    }
    const { data, errors } = validateDishInput(input);
    if (Object.keys(errors).length) throw new ValidationError(errors);
    await validateReferences(data);
    return data;
  }

  return {
    async listPublic({ categoryId = '', q = '', page = 1, pageSize = 6 } = {}) {
      if (categoryId && !isUuid(categoryId)) throw new HttpError(404, NOT_FOUND_MESSAGE);
      if (categoryId && !await model.findCategory(categoryId)) throw new HttpError(404, NOT_FOUND_MESSAGE);
      const parsedPage = Number.parseInt(page, 10);
      const safePage = Number.isSafeInteger(parsedPage) && parsedPage > 0 ? Math.min(parsedPage, 100000) : 1;
      const rawPageSize = pageSize == null ? '6' : typeof pageSize === 'number' ? String(pageSize) : pageSize;
      if (typeof rawPageSize !== 'string' || !/^\d+$/.test(rawPageSize)) {
        throw new ValidationError({ pageSize: 'Số món mỗi trang phải là số nguyên từ 1 đến 100.' });
      }
      const parsedPageSize = Number(rawPageSize);
      if (!Number.isSafeInteger(parsedPageSize) || parsedPageSize < 1 || parsedPageSize > 100) {
        throw new ValidationError({ pageSize: 'Số món mỗi trang phải là số nguyên từ 1 đến 100.' });
      }
      return model.listPublic({ categoryId, q: String(q || '').trim().slice(0, 100), page: safePage, pageSize: parsedPageSize });
    },
    async publicMenu(query = {}) {
      const [result, categories] = await Promise.all([this.listPublic(query), model.listCategories()]);
      return { ...result, categories };
    },
    listFeatured(limit) { return model.listFeatured(limit); },
    listCategories() { return model.listCategories(); },
    listAdmin(query = {}) {
      const filters = parseAdminDishFilters(query);
      return model.listAdmin({ ...query, ...filters, categoryId: '' });
    },
    formOptions() { return model.formOptions(); },
    findPublicById(id) { return isUuid(id) ? model.findPublicById(id) : Promise.resolve(null); },
    findById(id) { return isUuid(id) ? model.findById(id) : Promise.resolve(null); },
    async create(input) {
      const data = await checked(input);
      for (let attempt = 0; attempt < 6; attempt += 1) {
        const slug = await uniqueSlug(model, data.name);
        try { return await model.create({ ...data, slug }); }
        catch (error) {
          if (isUniqueFieldError(error, 'slug') && attempt < 5) continue;
          if (isPrismaCode(error, 'P2003')) throw new HttpError(404, NOT_FOUND_MESSAGE);
          throw error;
        }
      }
      throw new HttpError(409, 'Không thể lưu món ăn lúc này. Vui lòng thử lại.');
    },
    async update(id, input) {
      const data = await checked(input);
      const current = await model.findById(id);
      if (!current) return null;
      const slug = data.name === current.name ? current.slug : await uniqueSlug(model, data.name, id);
      try { return await model.update(id, { ...data, slug }); }
      catch (error) {
        if (isPrismaCode(error, 'P2025')) return null;
        if (isPrismaCode(error, 'P2003')) throw new HttpError(404, NOT_FOUND_MESSAGE);
        throw error;
      }
    },
    async remove(id) {
      try { await model.remove(id); return true; }
      catch (error) { if (isPrismaCode(error, 'P2025')) return false; throw error; }
    }
  };
}

module.exports = { createDishService };
