function createCategoryModel(db) {
  return {
    list() { return db.category.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }); },
    findUnique(args) { return db.category.findUnique(args); },
    findById(id) { return db.category.findUnique({ where: { id } }); },
    async nextSortOrder() {
      const result = await db.category.aggregate({ _max: { sortOrder: true } });
      return (result._max.sortOrder ?? -1) + 1;
    },
    create(data) { return db.category.create({ data }); },
    update(id, data) { return db.category.update({ where: { id }, data }); },
    remove(id) { return db.category.delete({ where: { id } }); }
  };
}

module.exports = { createCategoryModel };
