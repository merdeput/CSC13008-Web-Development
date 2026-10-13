const { Prisma } = require('@prisma/client');
const { HttpError, ValidationError, isPrismaCode, isUniqueFieldError } = require('../lib/errors');
const { uniqueSlug } = require('../lib/slug');
const { PAGE_SIZE, getPage, pageResult } = require('./pagination');
const { isUuid } = require('./validation');
const { getAdminSort } = require('./admin-list-sorting');

const dishInclude = {
  category: true,
  ingredients: { include: { ingredient: true }, orderBy: { ingredient: { name: 'asc' } } }
};

const dishAdminSorts = {
  name: (direction) => [{ name: direction }, { id: 'asc' }],
  category: (direction) => [{ category: { name: direction } }, { name: 'asc' }, { id: 'asc' }],
  price: (direction) => [{ price: direction }, { name: 'asc' }, { id: 'asc' }],
  visibility: (direction) => [{ isPublished: direction }, { name: 'asc' }, { id: 'asc' }],
  availability: (direction) => [{ isAvailable: direction }, { name: 'asc' }, { id: 'asc' }],
  updatedAt: (direction) => [{ updatedAt: direction }, { id: 'asc' }]
};

function createDishService(db) {
  async function ensureReferences(data) {
    const errors = {};
    const category = await db.category.findUnique({ where: { id: data.categoryId }, select: { id: true } });
    if (!category) errors.categoryId = 'Danh mục không tồn tại. Hãy chọn lại danh mục.';
    if (data.ingredientIds.length) {
      const found = await db.ingredient.findMany({ where: { id: { in: data.ingredientIds } }, select: { id: true } });
      if (found.length !== data.ingredientIds.length) errors.ingredientIds = 'Một hoặc nhiều nguyên liệu không còn tồn tại. Hãy tải lại biểu mẫu.';
    }
    if (Object.keys(errors).length) throw new ValidationError(errors);
  }

  function ingredientCreate(data) {
    return data.ingredientIds.map((ingredientId) => ({ ingredient: { connect: { id: ingredientId } } }));
  }

  async function create(data) {
    await ensureReferences(data);
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const slug = await uniqueSlug(db.dish, data.name);
      try {
        return await db.dish.create({
          data: {
            category: { connect: { id: data.categoryId } },
            name: data.name,
            slug,
            description: data.description,
            price: new Prisma.Decimal(data.price),
            imageUrl: data.imageUrl,
            isPublished: data.isPublished,
            isAvailable: data.isAvailable,
            isFeatured: data.isFeatured,
            ingredients: { create: ingredientCreate(data) }
          },
          include: dishInclude
        });
      } catch (error) {
        if (isUniqueFieldError(error, 'slug') && attempt < 5) continue;
        if (isPrismaCode(error, 'P2003')) throw new ValidationError({ categoryId: 'Danh mục hoặc nguyên liệu không còn tồn tại.' });
        throw error;
      }
    }
    throw new HttpError(409, 'Không thể tạo đường dẫn duy nhất cho món ăn. Hãy thử lại.');
  }

  async function update(id, data) {
    await ensureReferences(data);
    for (let attempt = 0; attempt < 6; attempt += 1) {
      try {
        return await db.$transaction(async (tx) => {
          const current = await tx.dish.findUnique({ where: { id }, select: { id: true, name: true, slug: true } });
          if (!current) return null;
          const slug = data.name === current.name ? current.slug : await uniqueSlug(tx.dish, data.name, id);
          return tx.dish.update({
            where: { id },
            data: {
              categoryId: data.categoryId,
              name: data.name,
              slug,
              description: data.description,
              price: new Prisma.Decimal(data.price),
              imageUrl: data.imageUrl,
              isPublished: data.isPublished,
              isAvailable: data.isAvailable,
              isFeatured: data.isFeatured,
              ingredients: { deleteMany: {}, create: ingredientCreate(data) }
            },
            include: dishInclude
          });
        });
      } catch (error) {
        if (isUniqueFieldError(error, 'slug') && attempt < 5) continue;
        if (isPrismaCode(error, 'P2025')) return null;
        if (isPrismaCode(error, 'P2003')) throw new ValidationError({ categoryId: 'Danh mục hoặc nguyên liệu không còn tồn tại.' });
        throw error;
      }
    }
    throw new HttpError(409, 'Không thể tạo đường dẫn duy nhất cho món ăn. Hãy thử lại.');
  }

  async function remove(id) {
    try {
      await db.dish.delete({ where: { id } });
      return true;
    } catch (error) {
      if (isPrismaCode(error, 'P2025')) return false;
      throw error;
    }
  }

  return {
    async listPublic({ categoryId = '', q = '' } = {}) {
      const where = { isPublished: true };
      if (categoryId) where.category = { id: categoryId };
      if (q) where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
        { ingredients: { some: { ingredient: { name: { contains: q, mode: 'insensitive' } } } } }
      ];
      return db.dish.findMany({ where, include: dishInclude, orderBy: [{ isFeatured: 'desc' }, { name: 'asc' }] });
    },
    listFeatured(limit = 4) {
      return db.dish.findMany({
        where: { isPublished: true, isFeatured: true },
        include: dishInclude,
        orderBy: { name: 'asc' },
        take: limit
      });
    },
    listAdmin({ page = 1, sortBy, sortDirection } = {}) {
      const current = getPage({ page });
      const sort = getAdminSort({ sortBy, sortDirection }, dishAdminSorts, 'updatedAt', 'desc');
      return Promise.all([
        db.dish.findMany({ include: dishInclude, orderBy: sort.orderBy, skip: (current - 1) * PAGE_SIZE, take: PAGE_SIZE }),
        db.dish.count()
      ]).then(([items, total]) => ({ ...pageResult(items, total, current), sortBy: sort.sortBy, sortDirection: sort.sortDirection }));
    },
    findPublicById(id) {
      return db.dish.findFirst({ where: { id, isPublished: true }, include: dishInclude });
    },
    findById(id) {
      return db.dish.findUnique({ where: { id }, include: dishInclude });
    },
    async formOptions() {
      const [categories, ingredients] = await Promise.all([
        db.category.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
        db.ingredient.findMany({ orderBy: { name: 'asc' } })
      ]);
      return { categories, ingredients };
    },
    listCategories() {
      return db.category.findMany({
        where: { dishes: { some: { isPublished: true } } },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }]
      });
    },
    create,
    update,
    remove,
    isUuid
  };
}

module.exports = { createDishService, dishInclude };
