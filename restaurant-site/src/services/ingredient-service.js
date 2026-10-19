const { ValidationError, isPrismaCode, isUniqueFieldError } = require('../lib/errors');
const { PAGE_SIZE, getPage, pageResult } = require('./pagination');
const { getAdminSort, getAdminSearch } = require('./admin-list-sorting');

const ingredientAdminSorts = {
  name: (direction) => [{ name: direction }, { id: 'asc' }],
  usage: (direction) => [{ dishes: { _count: direction } }, { name: 'asc' }, { id: 'asc' }]
};

function createIngredientService(db) {
  return {
    async listAdmin({ page = 1, sortBy, sortDirection, q } = {}) {
      const current = getPage({ page });
      const sort = getAdminSort({ sortBy, sortDirection }, ingredientAdminSorts, 'name', 'asc');
      const search = getAdminSearch(q);
      const where = search ? { name: { contains: search, mode: 'insensitive' } } : {};
      const [items, total] = await Promise.all([
        db.ingredient.findMany({
          where,
          include: { _count: { select: { dishes: true } } },
          orderBy: sort.orderBy,
          skip: (current - 1) * PAGE_SIZE,
          take: PAGE_SIZE
        }),
        db.ingredient.count({ where })
      ]);
      return { ...pageResult(items, total, current), sortBy: sort.sortBy, sortDirection: sort.sortDirection, q: search };
    },
    findById(id) {
      return db.ingredient.findUnique({
        where: { id },
        include: {
          dishes: {
            include: { dish: { select: { id: true, name: true } } }
          }
        }
      });
    },
    async create(data) {
      try {
        return await db.ingredient.create({ data });
      } catch (error) {
        if (isUniqueFieldError(error, 'name')) throw new ValidationError({ name: 'Tên nguyên liệu này đã tồn tại.' });
        throw error;
      }
    },
    async update(id, data) {
      try {
        return await db.ingredient.update({ where: { id }, data });
      } catch (error) {
        if (isPrismaCode(error, 'P2025')) return null;
        if (isUniqueFieldError(error, 'name')) throw new ValidationError({ name: 'Tên nguyên liệu này đã tồn tại.' });
        throw error;
      }
    },
    async remove(id) {
      try {
        await db.ingredient.delete({ where: { id } });
        return true;
      } catch (error) {
        if (isPrismaCode(error, 'P2025')) return false;
        if (isPrismaCode(error, 'P2003')) return 'in-use';
        throw error;
      }
    }
  };
}

module.exports = { createIngredientService };
