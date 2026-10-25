const { PAGE_SIZE, getPage, pageResult } = require('../services/pagination');
const { getAdminSort, getAdminSearch } = require('../services/admin-list-sorting');

const ingredientAdminSorts = {
  name: (direction) => [{ name: direction }, { id: 'asc' }]
};

function createIngredientModel(db) {
  return {
    async listAdmin(query = {}) {
      const page = getPage(query);
      const sort = getAdminSort(query, ingredientAdminSorts, 'name', 'asc');
      const q = getAdminSearch(query.q);
      const where = q ? { name: { contains: q, mode: 'insensitive' } } : {};
      const [items, total] = await Promise.all([
        db.ingredient.findMany({ where, orderBy: sort.orderBy, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE, include: { _count: { select: { dishes: true } } } }),
        db.ingredient.count({ where })
      ]);
      return { ...pageResult(items, total, page), sortBy: sort.sortBy, sortDirection: sort.sortDirection, q };
    },
    findById(id) { return db.ingredient.findUnique({ where: { id }, include: { dishes: { include: { dish: { select: { id: true, name: true } } } } } }); },
    create(data) { return db.ingredient.create({ data }); },
    update(id, data) { return db.ingredient.update({ where: { id }, data }); },
    remove(id) { return db.ingredient.delete({ where: { id } }); }
  };
}

module.exports = { createIngredientModel };
