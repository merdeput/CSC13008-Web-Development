const { HttpError, ValidationError, isPrismaCode, isUniqueFieldError } = require('../lib/errors');
const { uniqueSlug } = require('../lib/slug');
const { isUuid, validateCategoryInput } = require('./validation');

const NOT_FOUND = 'Danh mục không còn tồn tại.';
const DUPLICATE_NAME = 'Tên danh mục này đã tồn tại.';

function createCategoryService(db) {
  async function ensureNameAvailable(name, exceptId) {
    const existing = await db.category.findUnique({ where: { name }, select: { id: true } });
    if (existing && existing.id !== exceptId) throw new ValidationError({ name: DUPLICATE_NAME });
  }

  return {
    list() {
      return db.category.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }], include: { _count: { select: { dishes: true } } } });
    },
    findById(id) {
      return isUuid(id) ? db.category.findUnique({ where: { id }, include: { _count: { select: { dishes: true } } } }) : null;
    },
    async create(input) {
      const { data, errors } = validateCategoryInput(input);
      if (Object.keys(errors).length) throw new ValidationError(errors);
      await ensureNameAvailable(data.name);
      for (let attempt = 0; attempt < 6; attempt += 1) {
        const [slug, last] = await Promise.all([
          uniqueSlug(db.category, data.name),
          db.category.findFirst({ orderBy: { sortOrder: 'desc' }, select: { sortOrder: true } })
        ]);
        try {
          return await db.category.create({ data: { ...data, slug, sortOrder: (last?.sortOrder ?? -1) + 1 } });
        } catch (error) {
          if (isUniqueFieldError(error, 'name')) throw new ValidationError({ name: DUPLICATE_NAME });
          if (isUniqueFieldError(error, 'slug') && attempt < 5) continue;
          throw error;
        }
      }
      throw new HttpError(409, 'Không thể lưu danh mục lúc này. Vui lòng thử lại.');
    },
    async update(id, input) {
      if (!isUuid(id)) return null;
      const { data, errors } = validateCategoryInput(input);
      if (Object.keys(errors).length) throw new ValidationError(errors);
      const current = await db.category.findUnique({ where: { id } });
      if (!current) return null;
      if (current.name === data.name) return current;
      await ensureNameAvailable(data.name, id);
      for (let attempt = 0; attempt < 6; attempt += 1) {
        const slug = await uniqueSlug(db.category, data.name, id);
        try {
          return await db.category.update({ where: { id }, data: { ...data, slug } });
        } catch (error) {
          if (isPrismaCode(error, 'P2025')) return null;
          if (isUniqueFieldError(error, 'name')) throw new ValidationError({ name: DUPLICATE_NAME });
          if (isUniqueFieldError(error, 'slug') && attempt < 5) continue;
          throw error;
        }
      }
      throw new HttpError(409, 'Không thể lưu danh mục lúc này. Vui lòng thử lại.');
    },
    async remove(id) {
      if (!isUuid(id)) return false;
      try {
        await db.category.delete({ where: { id } });
        return true;
      } catch (error) {
        if (isPrismaCode(error, 'P2025')) return false;
        if (isPrismaCode(error, 'P2003')) throw new HttpError(409, 'Không thể xóa danh mục đang được dùng trong món ăn.');
        throw error;
      }
    }
  };
}

module.exports = { createCategoryService };
