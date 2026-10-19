const { PAGE_SIZE, getPage, pageResult } = require('../services/pagination');
const { getAdminSort, getAdminSearch } = require('../services/admin-list-sorting');

const chefAdminSorts = {
  name: (direction) => [{ name: direction }, { id: 'asc' }],
  title: (direction) => [{ title: direction }, { name: 'asc' }, { id: 'asc' }],
  specialty: (direction) => [{ specialty: direction }, { name: 'asc' }, { id: 'asc' }],
  sortOrder: (direction) => [{ sortOrder: direction }, { name: 'asc' }, { id: 'asc' }],
  visibility: (direction) => [{ isPublished: direction }, { name: 'asc' }, { id: 'asc' }]
};

const chefDetailInclude = {
  dishes: { select: { id: true, name: true }, orderBy: { name: 'asc' } }
};

function createChefModel(db) {
  return {
    listPublished() {
      return db.chef.findMany({
        where: { isPublished: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        include: { dishes: { where: { isPublished: true }, select: { id: true, name: true, imageUrl: true }, orderBy: { name: 'asc' } } }
      });
    },
    async listAdmin(query = {}) {
      const page = getPage(query);
      const sort = getAdminSort(query, chefAdminSorts, 'sortOrder', 'asc');
      const q = getAdminSearch(query.q);
      const where = q ? { OR: [
        { name: { contains: q, mode: 'insensitive' } }, { title: { contains: q, mode: 'insensitive' } },
        { specialty: { contains: q, mode: 'insensitive' } }, { bio: { contains: q, mode: 'insensitive' } }
      ] } : {};
      const [items, total] = await Promise.all([
        db.chef.findMany({ where, include: chefDetailInclude, orderBy: sort.orderBy, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
        db.chef.count({ where })
      ]);
      return { ...pageResult(items, total, page), sortBy: sort.sortBy, sortDirection: sort.sortDirection, q };
    },
    findById(id) { return db.chef.findUnique({ where: { id }, include: chefDetailInclude }); },
    formOptions() {
      return db.dish.findMany({
        select: { id: true, name: true, chefId: true, isPublished: true, chef: { select: { name: true } } },
        orderBy: [{ name: 'asc' }, { id: 'asc' }]
      }).then((dishes) => ({ dishes }));
    },
    countDishesByIds(ids) { return db.dish.count({ where: { id: { in: ids } } }); },
    async assignDishes(transaction, chefId, dishIds) {
      const unassignWhere = dishIds.length
        ? { chefId, id: { notIn: dishIds } }
        : { chefId };
      await transaction.dish.updateMany({ where: unassignWhere, data: { chefId: null } });
      if (dishIds.length) {
        await transaction.dish.updateMany({ where: { id: { in: dishIds } }, data: { chefId } });
      }
    },
    create(data) {
      const { dishIds, ...chefData } = data;
      return db.$transaction(async (transaction) => {
        const chef = await transaction.chef.create({ data: chefData });
        if (dishIds !== undefined) await this.assignDishes(transaction, chef.id, dishIds);
        return transaction.chef.findUnique({ where: { id: chef.id }, include: chefDetailInclude });
      });
    },
    update(id, data) {
      const { dishIds, ...chefData } = data;
      return db.$transaction(async (transaction) => {
        await transaction.chef.update({ where: { id }, data: chefData });
        if (dishIds !== undefined) await this.assignDishes(transaction, id, dishIds);
        return transaction.chef.findUnique({ where: { id }, include: chefDetailInclude });
      });
    },
    remove(id) { return db.chef.delete({ where: { id } }); }
  };
}

module.exports = { createChefModel };
