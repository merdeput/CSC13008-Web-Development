const { Prisma } = require('@prisma/client');
const { HttpError, ValidationError, isPrismaCode, isUniqueFieldError } = require('../lib/errors');
const { uniqueSlug } = require('../lib/slug');
const { PAGE_SIZE, getPage, pageResult } = require('./pagination');
const { isUuid } = require('./validation');
const { getAdminSort, getAdminSearch } = require('./admin-list-sorting');

const dishInclude = {
  category: true,
  chef: { select: { id: true, name: true, title: true, specialty: true, imageUrl: true } },
  ingredients: { include: { ingredient: true }, orderBy: { ingredient: { name: 'asc' } } }
};

const MAX_DISH_PRICE = 999999999999;

function parseDishFilters(query = {}) {
  const errors = {};
  const values = query.categoryIds ?? query.categoryId;
  const rawCategories = values == null ? [] : Array.isArray(values) ? values : [values];
  if (rawCategories.some((value) => typeof value !== 'string')) errors.categoryIds = 'Danh mục không hợp lệ.';
  const categoryIds = rawCategories.flatMap((value) => typeof value === 'string' ? value.split(',').map((id) => id.trim()).filter(Boolean) : []);
  let uniqueCategoryIds = [...new Set(categoryIds)];
  if (uniqueCategoryIds.length > 100 || uniqueCategoryIds.some((id) => !isUuid(id))) {
    errors.categoryIds = 'Danh mục không hợp lệ.';
    uniqueCategoryIds = [];
  }

  function optionalBoolean(field) {
    const value = query[field];
    if (value == null || value === '') return undefined;
    if (value === 'true') return true;
    if (value === 'false') return false;
    errors[field] = 'Giá trị lọc không hợp lệ.';
    return undefined;
  }
  function optionalPrice(field) {
    const value = query[field];
    if (value == null || value === '') return undefined;
    const text = typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
    const number = Number(text);
    if (!/^\d{1,12}$/.test(text) || !Number.isSafeInteger(number) || number > MAX_DISH_PRICE) {
      errors[field] = 'Giá phải là số nguyên từ 0 đến 999.999.999.999 đồng.';
      return undefined;
    }
    return text;
  }
  const isPublished = optionalBoolean('isPublished');
  const isAvailable = optionalBoolean('isAvailable');
  const isFeatured = optionalBoolean('isFeatured');
  let minPrice = optionalPrice('minPrice');
  let maxPrice = optionalPrice('maxPrice');
  if (minPrice !== undefined && maxPrice !== undefined && Number(minPrice) > Number(maxPrice)) {
    errors.maxPrice = 'Giá tối đa phải bằng hoặc lớn hơn giá tối thiểu.';
    minPrice = undefined;
    maxPrice = undefined;
  }
  return { categoryIds: uniqueCategoryIds, isPublished, isAvailable, isFeatured, minPrice, maxPrice, errors };
}

function parsePublicPage(query = {}) {
  const pageText = typeof query.page === 'string' ? query.page : '1';
  const sizeText = typeof query.pageSize === 'string' ? query.pageSize : '6';
  const pageNumber = /^\d+$/.test(pageText) ? Number(pageText) : 1;
  const sizeNumber = /^\d+$/.test(sizeText) ? Number(sizeText) : 6;
  if (!Number.isSafeInteger(sizeNumber) || sizeNumber < 1 || sizeNumber > 100) {
    throw new ValidationError({ pageSize: 'Số món mỗi trang phải từ 1 đến 100.' });
  }
  return {
    page: Number.isSafeInteger(pageNumber) && pageNumber > 0 ? Math.min(pageNumber, 100000) : 1,
    pageSize: sizeNumber
  };
}

async function hydrateSearchPage(db, rows, page, pageSize) {
  const total = Number(rows[0]?.total || 0);
  const ids = rows.map(({ id }) => id).filter(Boolean);
  const records = ids.length ? await db.dish.findMany({ where: { id: { in: ids } }, include: dishInclude }) : [];
  const byId = new Map(records.map((dish) => [dish.id, dish]));
  return pageResult(ids.map((id) => byId.get(id)).filter(Boolean), total, page, pageSize);
}

function fuzzySearchOptions(searchText) {
  const characters = Array.from(searchText).length;
  const tokens = searchText.match(/[\p{L}\p{N}]+/gu) || [];
  const quotedPhrase = /"[^"]+"/u.test(searchText);
  const canFuzzyMatch = characters >= 4 && !quotedPhrase;
  const canFuzzyMatchDescription = canFuzzyMatch && characters >= 8 && tokens.length >= 2 &&
    tokens.every((token) => Array.from(token).length >= 3);
  return { canFuzzyMatch, canFuzzyMatchDescription };
}

async function listPublicSearchMode(db, { mode, categoryId, q, minPrice, maxPrice, available, page, pageSize }) {
  const offset = Math.max(0, (page - 1) * pageSize);
  const categoryClause = categoryId ? Prisma.sql`AND d."categoryId" = CAST(${categoryId} AS uuid)` : Prisma.empty;

  if (mode === 'basic' || mode === 'advanced') {
    const predicates = [Prisma.sql`d."isPublished" = true`];
    if (categoryId) predicates.push(Prisma.sql`d."categoryId" = CAST(${categoryId} AS uuid)`);
    if (q) predicates.push(Prisma.sql`POSITION(lower(${q}) IN lower(d."name")) > 0`);
    if (mode === 'advanced') {
      if (minPrice !== undefined) predicates.push(Prisma.sql`d."price" >= CAST(${minPrice} AS numeric)`);
      if (maxPrice !== undefined) predicates.push(Prisma.sql`d."price" <= CAST(${maxPrice} AS numeric)`);
      if (available !== undefined) predicates.push(Prisma.sql`d."isAvailable" = ${available}`);
    }
    const rows = await db.$queryRaw`
      WITH filtered AS MATERIALIZED (
        SELECT d."id", d."name" FROM "Dish" AS d
        WHERE ${Prisma.join(predicates, ' AND ')}
      ), total AS (SELECT COUNT(*) AS total FROM filtered),
      page AS (
        SELECT "id", row_number() OVER (ORDER BY "name" ASC, "id" ASC) AS position
        FROM filtered ORDER BY "name" ASC, "id" ASC OFFSET ${offset} LIMIT ${pageSize}
      )
      SELECT total.total, page."id" FROM total LEFT JOIN page ON true
      ORDER BY page.position ASC NULLS LAST
    `;
    return hydrateSearchPage(db, rows, page, pageSize);
  }

  if (mode === 'fulltext') {
    const rows = await db.$queryRaw`
      WITH terms AS (SELECT websearch_to_tsquery('simple', ${q}) AS query),
      matches AS MATERIALIZED (
        SELECT d."id", ts_rank_cd(to_tsvector('simple', COALESCE(d."name", '') || ' ' || COALESCE(d."description", '')), terms.query) AS score
        FROM "Dish" AS d CROSS JOIN terms
        WHERE d."isPublished" = true ${categoryClause}
          AND to_tsvector('simple', COALESCE(d."name", '') || ' ' || COALESCE(d."description", '')) @@ terms.query
      ), total AS (SELECT COUNT(*) AS total FROM matches),
      page AS (
        SELECT "id", row_number() OVER (ORDER BY score DESC, "id" ASC) AS position
        FROM matches ORDER BY score DESC, "id" ASC OFFSET ${offset} LIMIT ${pageSize}
      )
      SELECT total.total, page."id" FROM total LEFT JOIN page ON true
      ORDER BY page.position ASC NULLS LAST
    `;
    return hydrateSearchPage(db, rows, page, pageSize);
  }

  return db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('SET LOCAL pg_trgm.similarity_threshold = 0.3');
    const rows = await tx.$queryRaw`
      WITH matches AS MATERIALIZED (
        SELECT d."id", extensions.similarity(d."name", ${q}) AS score
        FROM "Dish" AS d
        WHERE d."isPublished" = true ${categoryClause}
          AND d."name" OPERATOR(extensions.%) ${q}
      ), total AS (SELECT COUNT(*) AS total FROM matches),
      page AS (
        SELECT "id", row_number() OVER (ORDER BY score DESC, "id" ASC) AS position
        FROM matches ORDER BY score DESC, "id" ASC OFFSET ${offset} LIMIT ${pageSize}
      )
      SELECT total.total, page."id" FROM total LEFT JOIN page ON true
      ORDER BY page.position ASC NULLS LAST
    `;
    return hydrateSearchPage(tx, rows, page, pageSize);
  });
}

async function listCombinedPublicSearch(db, { categoryId, q, page, pageSize }) {
  const { canFuzzyMatch, canFuzzyMatchDescription } = fuzzySearchOptions(q);
  const categoryFilter = categoryId ? Prisma.sql`AND d."categoryId" = CAST(${categoryId} AS uuid)` : Prisma.empty;
  const fuzzyMatches = canFuzzyMatch ? Prisma.sql`
    UNION ALL
    SELECT d."id", d."isFeatured" AS is_featured, d."name", 20 AS match_tier,
      extensions.similarity(extensions.unaccent(d."name"), extensions.unaccent(q.search_text)) AS similarity_score
    FROM "Dish" AS d CROSS JOIN parsed_query AS q
    WHERE d."isPublished" = true ${categoryFilter}
      AND extensions.similarity(extensions.unaccent(d."name"), extensions.unaccent(q.search_text)) >= 0.4
    ${canFuzzyMatchDescription ? Prisma.sql`
      UNION ALL
      SELECT d."id", d."isFeatured" AS is_featured, d."name", 25 AS match_tier,
        extensions.word_similarity(extensions.unaccent(q.search_text), extensions.unaccent(d."description")) AS similarity_score
      FROM "Dish" AS d CROSS JOIN parsed_query AS q
      WHERE d."isPublished" = true ${categoryFilter}
        AND extensions.word_similarity(extensions.unaccent(q.search_text), extensions.unaccent(d."description")) >= 0.68
    ` : Prisma.empty}
    UNION ALL
    SELECT d."id", d."isFeatured" AS is_featured, d."name", 30 AS match_tier,
      extensions.similarity(extensions.unaccent(i."name"), extensions.unaccent(q.search_text)) AS similarity_score
    FROM "Ingredient" AS i
    JOIN "DishIngredient" AS di ON di."ingredientId" = i."id"
    JOIN "Dish" AS d ON d."id" = di."dishId"
    CROSS JOIN parsed_query AS q
    WHERE d."isPublished" = true ${categoryFilter}
      AND extensions.similarity(extensions.unaccent(i."name"), extensions.unaccent(q.search_text)) >= 0.4
  ` : Prisma.empty;
  const rows = await db.$queryRaw`
    WITH parsed_query AS (
      SELECT websearch_to_tsquery('public.menu_search_unaccent', ${q}) AS terms, ${q}::text AS search_text
    ), candidates AS (
      SELECT d."id", d."isFeatured" AS is_featured, d."name",
        CASE WHEN to_tsvector('public.menu_search_unaccent', COALESCE(d."name", '')) =
          to_tsvector('public.menu_search_unaccent', q.search_text) THEN 50 ELSE 40 END AS match_tier,
        ts_rank_cd(to_tsvector('public.menu_search_unaccent', COALESCE(d."name", '')), q.terms) AS similarity_score
      FROM "Dish" AS d CROSS JOIN parsed_query AS q
      WHERE d."isPublished" = true ${categoryFilter}
        AND to_tsvector('public.menu_search_unaccent', COALESCE(d."name", '')) @@ q.terms
      UNION ALL
      SELECT d."id", d."isFeatured" AS is_featured, d."name", 35 AS match_tier,
        ts_rank_cd(to_tsvector('public.menu_search_unaccent', COALESCE(i."name", '')), q.terms) AS similarity_score
      FROM "Ingredient" AS i
      JOIN "DishIngredient" AS di ON di."ingredientId" = i."id"
      JOIN "Dish" AS d ON d."id" = di."dishId"
      CROSS JOIN parsed_query AS q
      WHERE d."isPublished" = true ${categoryFilter}
        AND to_tsvector('public.menu_search_unaccent', COALESCE(i."name", '')) @@ q.terms
      UNION ALL
      SELECT d."id", d."isFeatured" AS is_featured, d."name", 30 AS match_tier,
        ts_rank_cd(to_tsvector('public.menu_search_unaccent', COALESCE(d."name", '') || ' ' || COALESCE(d."description", '')), q.terms) AS similarity_score
      FROM "Dish" AS d CROSS JOIN parsed_query AS q
      WHERE d."isPublished" = true ${categoryFilter}
        AND to_tsvector('public.menu_search_unaccent', COALESCE(d."name", '') || ' ' || COALESCE(d."description", '')) @@ q.terms
      ${fuzzyMatches}
    ), ranked_candidates AS (
      SELECT "id", is_featured, "name", match_tier, similarity_score,
        row_number() OVER (PARTITION BY "id" ORDER BY match_tier DESC, similarity_score DESC) AS candidate_rank
      FROM candidates
    ), matches AS MATERIALIZED (
      SELECT "id", is_featured, "name", match_tier, similarity_score FROM ranked_candidates WHERE candidate_rank = 1
    ), total AS (SELECT COUNT(*) AS total FROM matches), page AS (
      SELECT "id", row_number() OVER (ORDER BY match_tier DESC, similarity_score DESC, is_featured DESC, "name" ASC, "id" ASC) AS position
      FROM matches ORDER BY match_tier DESC, similarity_score DESC, is_featured DESC, "name" ASC, "id" ASC
      OFFSET ${Math.max(0, (page - 1) * pageSize)} LIMIT ${pageSize}
    )
    SELECT total.total, page."id" FROM total LEFT JOIN page ON true
    ORDER BY page.position ASC NULLS LAST
  `;
  return hydrateSearchPage(db, rows, page, pageSize);
}

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
    const [category, chef] = await Promise.all([
      db.category.findUnique({ where: { id: data.categoryId }, select: { id: true } }),
      data.chefId ? db.chef.findUnique({ where: { id: data.chefId }, select: { id: true } }) : Promise.resolve(true)
    ]);
    if (!category) errors.categoryId = 'Danh mục không tồn tại. Hãy chọn lại danh mục.';
    if (!chef) errors.chefId = 'Đầu bếp không tồn tại. Hãy chọn lại đầu bếp.';
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
            chefId: data.chefId,
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
              chefId: data.chefId,
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
    async listPublic({ categoryId = '', q = '', mode = 'combined', minPrice, maxPrice, available, page = 1, pageSize = 6 } = {}) {
      if (!['combined', 'basic', 'advanced', 'fulltext', 'fuzzy'].includes(mode)) throw new ValidationError({ mode: 'Chế độ tìm kiếm không hợp lệ.' });
      const paging = parsePublicPage({ page: String(page), pageSize: String(pageSize) });
      page = paging.page;
      pageSize = paging.pageSize;
      q = typeof q === 'string' ? q.trim().slice(0, 100) : '';
      if (mode !== 'combined') {
        if ((mode === 'fulltext' || mode === 'fuzzy') && !q) return pageResult([], 0, page, pageSize);
        return listPublicSearchMode(db, { mode, categoryId, q, minPrice, maxPrice, available, page, pageSize });
      }
      if (q) return listCombinedPublicSearch(db, { categoryId, q, page, pageSize });
      const where = { isPublished: true };
      if (categoryId) where.categoryId = categoryId;
      const [items, total] = await Promise.all([
        db.dish.findMany({ where, include: dishInclude, orderBy: [{ isFeatured: 'desc' }, { name: 'asc' }, { id: 'asc' }], skip: (page - 1) * pageSize, take: pageSize }),
        db.dish.count({ where })
      ]);
      return pageResult(items, total, page, pageSize);
    },
    listFeatured(limit = 4) {
      return db.dish.findMany({
        where: { isPublished: true, isFeatured: true },
        include: dishInclude,
        orderBy: { name: 'asc' },
        take: limit
      });
    },
    listAdmin({ page = 1, sortBy, sortDirection, q, ...queryFilters } = {}) {
      const current = getPage({ page });
      const sort = getAdminSort({ sortBy, sortDirection }, dishAdminSorts, 'updatedAt', 'desc');
      const search = getAdminSearch(q);
      const filters = parseDishFilters(queryFilters);
      const price = {
        ...(filters.minPrice !== undefined ? { gte: new Prisma.Decimal(filters.minPrice) } : {}),
        ...(filters.maxPrice !== undefined ? { lte: new Prisma.Decimal(filters.maxPrice) } : {})
      };
      const where = search ? {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
          { category: { is: { name: { contains: search, mode: 'insensitive' } } } },
          { chef: { is: { name: { contains: search, mode: 'insensitive' } } } },
          { ingredients: { some: { ingredient: { is: { name: { contains: search, mode: 'insensitive' } } } } } }
        ]
      } : {};
      Object.assign(where, {
        ...(filters.categoryIds.length ? { categoryId: { in: filters.categoryIds } } : {}),
        ...(filters.isPublished !== undefined ? { isPublished: filters.isPublished } : {}),
        ...(filters.isAvailable !== undefined ? { isAvailable: filters.isAvailable } : {}),
        ...(filters.isFeatured !== undefined ? { isFeatured: filters.isFeatured } : {}),
        ...(Object.keys(price).length ? { price } : {})
      });
      return Promise.all([
        db.dish.findMany({ where, include: dishInclude, orderBy: sort.orderBy, skip: (current - 1) * PAGE_SIZE, take: PAGE_SIZE }),
        db.dish.count({ where })
      ]).then(([items, total]) => ({ ...pageResult(items, total, current), sortBy: sort.sortBy, sortDirection: sort.sortDirection, q: search, filters, filterErrors: filters.errors }));
    },
    findPublicById(id) {
      return db.dish.findFirst({ where: { id, isPublished: true }, include: dishInclude });
    },
    findById(id) {
      return db.dish.findUnique({ where: { id }, include: dishInclude });
    },
    async formOptions() {
      const [categories, ingredients, chefs] = await Promise.all([
        db.category.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
        db.ingredient.findMany({ orderBy: { name: 'asc' } }),
        db.chef.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] })
      ]);
      return { categories, ingredients, chefs };
    },
    listAllCategories() { return db.category.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }); },
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

module.exports = { createDishService, dishInclude, parseDishFilters, parsePublicPage };
