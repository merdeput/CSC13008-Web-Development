const { Prisma } = require('@prisma/client');
const { PAGE_SIZE, getPage, pageResult } = require('../services/pagination');
const { getAdminSort, getAdminSearch } = require('../services/admin-list-sorting');

const dishInclude = {
  category: true,
  chef: { select: { id: true, name: true, title: true, specialty: true, imageUrl: true } },
  ingredients: { include: { ingredient: true }, orderBy: { ingredient: { name: 'asc' } } }
};

const adminSorts = {
  name: (direction) => [{ name: direction }, { id: 'asc' }],
  category: (direction) => [{ category: { name: direction } }, { name: 'asc' }, { id: 'asc' }],
  price: (direction) => [{ price: direction }, { name: 'asc' }, { id: 'asc' }],
  visibility: (direction) => [{ isPublished: direction }, { name: 'asc' }, { id: 'asc' }],
  availability: (direction) => [{ isAvailable: direction }, { name: 'asc' }, { id: 'asc' }],
  updatedAt: (direction) => [{ updatedAt: direction }, { id: 'asc' }]
};

function createDishModel(db) {
  return {
    listPublic({ categoryId = '', q = '' } = {}) {
      const where = { isPublished: true };
      if (categoryId) where.categoryId = categoryId;
      if (q) where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
        { ingredients: { some: { ingredient: { name: { contains: q, mode: 'insensitive' } } } } }
      ];
      return db.dish.findMany({ where, include: dishInclude, orderBy: [{ isFeatured: 'desc' }, { name: 'asc' }] });
    },
    listFeatured(limit = 4) {
      return db.dish.findMany({ where: { isPublished: true, isFeatured: true }, include: dishInclude, orderBy: { name: 'asc' }, take: limit });
    },
    async listAdmin(query = {}) {
      const page = getPage(query);
      const sort = getAdminSort(query, adminSorts, 'updatedAt', 'desc');
      const q = getAdminSearch(query.q);
      const where = q ? { OR: [
        { name: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
        { category: { name: { contains: q, mode: 'insensitive' } } },
        { chef: { name: { contains: q, mode: 'insensitive' } } },
        { ingredients: { some: { ingredient: { name: { contains: q, mode: 'insensitive' } } } } }
      ] } : {};
      const [items, total] = await Promise.all([
        db.dish.findMany({ where, include: dishInclude, orderBy: sort.orderBy, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
        db.dish.count({ where })
      ]);
      return { ...pageResult(items, total, page), sortBy: sort.sortBy, sortDirection: sort.sortDirection, q };
    },
    findPublicById(id) { return db.dish.findFirst({ where: { id, isPublished: true }, include: dishInclude }); },
    findById(id) { return db.dish.findUnique({ where: { id }, include: dishInclude }); },
    findUnique(args) { return db.dish.findUnique(args); },
    findCategory(id) { return db.category.findUnique({ where: { id }, select: { id: true } }); },
    findChef(id) { return db.chef.findUnique({ where: { id }, select: { id: true } }); },
    findIngredients(ids) { return db.ingredient.findMany({ where: { id: { in: ids } }, select: { id: true } }); },
    async formOptions() {
      const [categories, ingredients, chefs] = await Promise.all([
        db.category.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
        db.ingredient.findMany({ orderBy: { name: 'asc' } }),
        db.chef.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] })
      ]);
      return { categories, ingredients, chefs };
    },
    listCategories() { return db.category.findMany({ where: { dishes: { some: { isPublished: true } } }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }); },
    create(data) {
      return db.dish.create({
        data: {
          categoryId: data.categoryId, chefId: data.chefId, name: data.name, slug: data.slug,
          description: data.description, price: new Prisma.Decimal(data.price), imageUrl: data.imageUrl,
          isPublished: data.isPublished, isAvailable: data.isAvailable, isFeatured: data.isFeatured,
          ingredients: { create: data.ingredientIds.map((id) => ({ ingredient: { connect: { id } } })) }
        }, include: dishInclude
      });
    },
    update(id, data) {
      return db.dish.update({
        where: { id },
        data: {
          categoryId: data.categoryId, chefId: data.chefId, name: data.name, slug: data.slug,
          description: data.description, price: new Prisma.Decimal(data.price), imageUrl: data.imageUrl,
          isPublished: data.isPublished, isAvailable: data.isAvailable, isFeatured: data.isFeatured,
          ingredients: { deleteMany: {}, create: data.ingredientIds.map((ingredientId) => ({ ingredient: { connect: { id: ingredientId } } })) }
        }, include: dishInclude
      });
    },
    remove(id) { return db.dish.delete({ where: { id } }); }
  };
}

module.exports = { createDishModel, dishInclude };
