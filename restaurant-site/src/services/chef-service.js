const { HttpError, ValidationError, isPrismaCode } = require('../lib/errors');
const { PAGE_SIZE, getPage, pageResult } = require('./pagination');
const { getAdminSort, getAdminSearch } = require('./admin-list-sorting');

const chefAdminSorts = {
  name: (direction) => [{ name: direction }, { id: 'asc' }],
  title: (direction) => [{ title: direction }, { name: 'asc' }, { id: 'asc' }],
  specialty: (direction) => [{ specialty: direction }, { name: 'asc' }, { id: 'asc' }],
  sortOrder: (direction) => [{ sortOrder: direction }, { name: 'asc' }, { id: 'asc' }],
  visibility: (direction) => [{ isPublished: direction }, { name: 'asc' }, { id: 'asc' }]
};

function createChefService(db) {
  async function validateDishIds(dishIds) {
    if (dishIds.length && await db.dish.count({ where: { id: { in: dishIds } } }) !== dishIds.length) {
      throw new ValidationError({ dishIds: 'Một hoặc nhiều món đã không còn khả dụng.' });
    }
  }

  async function remove(id) {
    try {
      await db.chef.delete({ where: { id } });
      return true;
    } catch (error) {
      if (isPrismaCode(error, 'P2025')) return false;
      throw error;
    }
  }

  return {
    listPublished(limit) {
      return db.chef.findMany({ where: { isPublished: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }], ...(limit ? { take: limit } : {}) });
    },
    listAdmin({ page = 1, sortBy, sortDirection, q } = {}) {
      const current = getPage({ page });
      const sort = getAdminSort({ sortBy, sortDirection }, chefAdminSorts, 'sortOrder', 'asc');
      const search = getAdminSearch(q);
      const where = search ? {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { title: { contains: search, mode: 'insensitive' } },
          { specialty: { contains: search, mode: 'insensitive' } },
          { bio: { contains: search, mode: 'insensitive' } }
        ]
      } : {};
      return Promise.all([
        db.chef.findMany({ where, include: { dishes: { select: { id: true, name: true }, orderBy: { name: 'asc' } } }, orderBy: sort.orderBy, skip: (current - 1) * PAGE_SIZE, take: PAGE_SIZE }),
        db.chef.count({ where })
      ]).then(([items, total]) => ({ ...pageResult(items, total, current), sortBy: sort.sortBy, sortDirection: sort.sortDirection, q: search }));
    },
    findById(id) {
      return db.chef.findUnique({ where: { id }, include: { dishes: { select: { id: true, name: true }, orderBy: { name: 'asc' } } } });
    },
    formOptions() {
      return db.dish.findMany({ select: { id: true, name: true, chefId: true, chef: { select: { name: true } } }, orderBy: [{ name: 'asc' }, { id: 'asc' }] }).then((dishes) => ({ dishes }));
    },
    async create(data) {
      const dishIds = Array.isArray(data.dishIds) ? data.dishIds : [];
      await validateDishIds(dishIds);
      const { dishIds: _dishIds, ...chefData } = data;
      return db.$transaction(async (tx) => {
        const chef = await tx.chef.create({ data: chefData });
        if (dishIds.length) await tx.dish.updateMany({ where: { id: { in: dishIds } }, data: { chefId: chef.id } });
        return tx.chef.findUnique({ where: { id: chef.id }, include: { dishes: { select: { id: true, name: true }, orderBy: { name: 'asc' } } } });
      });
    },
    async update(id, data) {
      const hasDishAssignments = Object.prototype.hasOwnProperty.call(data, 'dishIds');
      const dishIds = Array.isArray(data.dishIds) ? data.dishIds : [];
      await validateDishIds(dishIds);
      const { dishIds: _dishIds, ...chefData } = data;
      try {
        return await db.$transaction(async (tx) => {
          await tx.chef.update({ where: { id }, data: chefData });
          if (hasDishAssignments) {
            await tx.dish.updateMany({ where: { chefId: id, ...(dishIds.length ? { id: { notIn: dishIds } } : {}) }, data: { chefId: null } });
            if (dishIds.length) await tx.dish.updateMany({ where: { id: { in: dishIds } }, data: { chefId: id } });
          }
          return tx.chef.findUnique({ where: { id }, include: { dishes: { select: { id: true, name: true }, orderBy: { name: 'asc' } } } });
        });
      } catch (error) {
        if (isPrismaCode(error, 'P2025')) return null;
        throw error;
      }
    },
    remove
  };
}

module.exports = { createChefService };
