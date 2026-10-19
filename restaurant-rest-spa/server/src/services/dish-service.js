const { HttpError, ValidationError, isPrismaCode, isUniqueFieldError } = require('../lib/errors');
const { uniqueSlug } = require('../lib/slug');
const { isUuid, validateDishInput } = require('./validation');

const UNAVAILABLE = 'Dữ liệu không khả dụng.';

function createDishService(model) {
  async function validateReferences(data) {
    if (!isUuid(data.categoryId) || (data.chefId && !isUuid(data.chefId)) || data.ingredientIds.some((id) => !isUuid(id))) {
      throw new HttpError(404, UNAVAILABLE);
    }
    const [category, chef, ingredients] = await Promise.all([
      model.findCategory(data.categoryId),
      data.chefId ? model.findChef(data.chefId) : Promise.resolve(true),
      data.ingredientIds.length ? model.findIngredients(data.ingredientIds) : Promise.resolve([])
    ]);
    if (!category || !chef || ingredients.length !== data.ingredientIds.length) throw new HttpError(404, UNAVAILABLE);
  }

  async function checked(input) {
    if (input.categoryId && !isUuid(String(input.categoryId))) throw new HttpError(404, UNAVAILABLE);
    if (input.chefId && !isUuid(String(input.chefId))) throw new HttpError(404, UNAVAILABLE);
    if (input.ingredientIds != null) {
      const values = Array.isArray(input.ingredientIds) ? input.ingredientIds : [input.ingredientIds];
      if (values.some((id) => typeof id !== 'string' || !isUuid(id))) throw new HttpError(404, UNAVAILABLE);
    }
    const { data, errors } = validateDishInput(input);
    if (Object.keys(errors).length) throw new ValidationError(errors);
    await validateReferences(data);
    return data;
  }

  return {
    async listPublic({ categoryId = '', q = '' } = {}) {
      if (categoryId && !isUuid(categoryId)) throw new HttpError(404, UNAVAILABLE);
      if (categoryId && !await model.findCategory(categoryId)) throw new HttpError(404, UNAVAILABLE);
      return model.listPublic({ categoryId, q: String(q || '').trim().slice(0, 100) });
    },
    async publicMenu(query = {}) {
      const [items, categories] = await Promise.all([this.listPublic(query), model.listCategories()]);
      return { items, categories };
    },
    listFeatured(limit) { return model.listFeatured(limit); },
    listCategories() { return model.listCategories(); },
    listAdmin(query) { return model.listAdmin(query); },
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
          if (isPrismaCode(error, 'P2003')) throw new HttpError(404, UNAVAILABLE);
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
        if (isPrismaCode(error, 'P2003')) throw new HttpError(404, UNAVAILABLE);
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
