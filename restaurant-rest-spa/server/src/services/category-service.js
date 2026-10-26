const { HttpError, ValidationError, isPrismaCode, isUniqueFieldError } = require('../lib/errors');
const { uniqueSlug } = require('../lib/slug');
const { isUuid, validateCategoryInput } = require('./validation');

const NOT_FOUND_MESSAGE = 'Dữ liệu không khả dụng.';
const DUPLICATE_NAME_MESSAGE = 'Tên danh mục này đã tồn tại.';

function createCategoryService(model) {
  async function ensureNameAvailable(name, exceptId) {
    const existing = await model.findUnique({ where: { name }, select: { id: true } });
    if (existing && existing.id !== exceptId) throw new ValidationError({ name: DUPLICATE_NAME_MESSAGE });
  }

  return {
    list() { return model.list(); },
    async create(input) {
      const { data, errors } = validateCategoryInput(input);
      if (Object.keys(errors).length) throw new ValidationError(errors);
      await ensureNameAvailable(data.name);

      for (let attempt = 0; attempt < 6; attempt += 1) {
        const slug = await uniqueSlug(model, data.name);
        try {
          const sortOrder = await model.nextSortOrder();
          return await model.create({ ...data, slug, sortOrder });
        } catch (error) {
          if (isPrismaCode(error, 'P2002')) {
            if (isUniqueFieldError(error, 'name')) throw new ValidationError({ name: DUPLICATE_NAME_MESSAGE });
            await ensureNameAvailable(data.name);
            if (attempt < 5) continue;
            break;
          }
          throw error;
        }
      }

      throw new HttpError(409, 'Không thể lưu danh mục lúc này. Vui lòng thử lại.');
    },
    async update(id, input) {
      if (!isUuid(id)) throw new HttpError(404, NOT_FOUND_MESSAGE);
      const { data, errors } = validateCategoryInput(input);
      if (Object.keys(errors).length) throw new ValidationError(errors);

      const current = await model.findById(id);
      if (!current) return null;
      if (current.name === data.name) return current;
      await ensureNameAvailable(data.name, id);
      for (let attempt = 0; attempt < 6; attempt += 1) {
        const slug = await uniqueSlug(model, data.name, id);
        try {
          return await model.update(id, { ...data, slug });
        } catch (error) {
          if (isPrismaCode(error, 'P2025')) return null;
          if (isPrismaCode(error, 'P2002')) {
            if (isUniqueFieldError(error, 'name')) throw new ValidationError({ name: DUPLICATE_NAME_MESSAGE });
            await ensureNameAvailable(data.name, id);
            if (attempt < 5) continue;
            break;
          }
          throw error;
        }
      }
      throw new HttpError(409, 'Không thể lưu danh mục lúc này. Vui lòng thử lại.');
    },
    async remove(id) {
      if (!isUuid(id)) throw new HttpError(404, NOT_FOUND_MESSAGE);
      try {
        await model.remove(id);
        return true;
      } catch (error) {
        if (isPrismaCode(error, 'P2025')) return false;
        if (isPrismaCode(error, 'P2003')) {
          throw new HttpError(409, 'Không thể xóa danh mục đang được dùng trong món ăn.');
        }
        throw error;
      }
    }
  };
}

module.exports = { createCategoryService };
