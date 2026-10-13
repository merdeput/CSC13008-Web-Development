const { HttpError, isPrismaCode } = require('../lib/errors');
const { PAGE_SIZE, getPage, pageResult } = require('./pagination');
const { getAdminSort } = require('./admin-list-sorting');

const chefAdminSorts = {
  name: (direction) => [{ name: direction }, { id: 'asc' }],
  title: (direction) => [{ title: direction }, { name: 'asc' }, { id: 'asc' }],
  specialty: (direction) => [{ specialty: direction }, { name: 'asc' }, { id: 'asc' }],
  sortOrder: (direction) => [{ sortOrder: direction }, { name: 'asc' }, { id: 'asc' }],
  visibility: (direction) => [{ isPublished: direction }, { name: 'asc' }, { id: 'asc' }]
};

function createChefService(db) {
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
    listAdmin({ page = 1, sortBy, sortDirection } = {}) {
      const current = getPage({ page });
      const sort = getAdminSort({ sortBy, sortDirection }, chefAdminSorts, 'sortOrder', 'asc');
      return Promise.all([
        db.chef.findMany({ orderBy: sort.orderBy, skip: (current - 1) * PAGE_SIZE, take: PAGE_SIZE }),
        db.chef.count()
      ]).then(([items, total]) => ({ ...pageResult(items, total, current), sortBy: sort.sortBy, sortDirection: sort.sortDirection }));
    },
    findById(id) {
      return db.chef.findUnique({ where: { id } });
    },
    create(data) {
      return db.chef.create({ data });
    },
    async update(id, data) {
      try {
        return await db.chef.update({ where: { id }, data });
      } catch (error) {
        if (isPrismaCode(error, 'P2025')) return null;
        throw error;
      }
    },
    remove
  };
}

module.exports = { createChefService };
