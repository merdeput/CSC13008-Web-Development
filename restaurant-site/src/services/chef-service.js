const { HttpError, isPrismaCode } = require('../lib/errors');
const { PAGE_SIZE, getPage, pageResult } = require('./pagination');

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
    listAdmin({ page = 1 } = {}) {
      const current = getPage({ page });
      return Promise.all([
        db.chef.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }], skip: (current - 1) * PAGE_SIZE, take: PAGE_SIZE }),
        db.chef.count()
      ]).then(([items, total]) => pageResult(items, total, current));
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
