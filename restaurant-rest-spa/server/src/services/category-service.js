const { HttpError, ValidationError, isPrismaCode, isUniqueFieldError } = require('../lib/errors');
const { uniqueSlug } = require('../lib/slug');
const { isUuid, validateCategoryInput } = require('./validation');

const UNAVAILABLE = 'Dữ liệu không khả dụng.';

function createCategoryService(model) {
  return {
    list() { return model.list(); },
    async create(input) {
      const { data, errors } = validateCategoryInput(input);
      if (Object.keys(errors).length) throw new ValidationError(errors);

      for (let attempt = 0; attempt < 6; attempt += 1) {
        const slug = await uniqueSlug(model, data.name);
        try {
          const sortOrder = await model.nextSortOrder();
          return await model.create({ ...data, slug, sortOrder });
        } catch (error) {
          if (isUniqueFieldError(error, 'name')) {
            throw new ValidationError({ name: 'Tên danh mục này đã tồn tại.' });
          }
          if (isUniqueFieldError(error, 'slug') && attempt < 5) continue;
          throw error;
        }
      }

      throw new HttpError(409, 'Không thể lưu danh mục lúc này. Vui lòng thử lại.');
    },
    async update(id, input) {
      if (!isUuid(id)) throw new HttpError(404, UNAVAILABLE);
      const { data, errors } = validateCategoryInput(input);
      if (Object.keys(errors).length) throw new ValidationError(errors);

      const current = await model.findById(id);
      if (!current) return null;
      for (let attempt = 0; attempt < 6; attempt += 1) {
        const slug = await uniqueSlug(model, data.name, id);
        try {
          return await model.update(id, { ...data, slug });
        } catch (error) {
          if (isPrismaCode(error, 'P2025')) return null;
          if (isUniqueFieldError(error, 'name')) {
            throw new ValidationError({ name: 'Tên danh mục này đã tồn tại.' });
          }
          if (isUniqueFieldError(error, 'slug') && attempt < 5) continue;
          throw error;
        }
      }
      throw new HttpError(409, 'Không thể lưu danh mục lúc này. Vui lòng thử lại.');
    },
    async remove(id) {
      if (!isUuid(id)) throw new HttpError(404, UNAVAILABLE);
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
