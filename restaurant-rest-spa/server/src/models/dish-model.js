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

function fuzzySearchOptions(searchText) {
  const characters = Array.from(searchText).length;
  const tokens = searchText.match(/[\p{L}\p{N}]+/gu) || [];
  const quotedPhrase = /"[^"]+"/u.test(searchText);
  const canFuzzyMatch = characters >= 4 && !quotedPhrase;
  const canFuzzyMatchDescription = canFuzzyMatch && characters >= 8 && tokens.length >= 2 &&
    tokens.every((token) => Array.from(token).length >= 3);

  return { canFuzzyMatch, canFuzzyMatchDescription };
}

async function hydrateDishPage(db, rows, page, pageSize) {
  const total = Number(rows[0]?.total || 0);
  const ids = rows.map(({ id }) => id).filter(Boolean);
  const records = ids.length
    ? await db.dish.findMany({ where: { id: { in: ids } }, include: dishInclude })
    : [];
  const byId = new Map(records.map((dish) => [dish.id, dish]));
  return pageResult(ids.map((id) => byId.get(id)).filter(Boolean), total, page, pageSize);
}

async function listPublicSearchMode(db, { mode, categoryId, q, minPrice, maxPrice, available, page, pageSize }) {
  const offset = Math.max(0, (page - 1) * pageSize);
  const categoryClause = categoryId
    ? Prisma.sql`AND d."categoryId" = CAST(${categoryId} AS uuid)`
    : Prisma.empty;

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
      ), total AS (
        SELECT COUNT(*) AS total FROM filtered
      ), page AS (
        SELECT "id", row_number() OVER (ORDER BY "name" ASC, "id" ASC) AS position
        FROM filtered ORDER BY "name" ASC, "id" ASC
        OFFSET ${offset} LIMIT ${pageSize}
      )
      SELECT total.total, page."id" FROM total LEFT JOIN page ON true
      ORDER BY page.position ASC NULLS LAST
    `;
    return hydrateDishPage(db, rows, page, pageSize);
  }

  if (mode === 'fulltext') {
    const rows = await db.$queryRaw`
      WITH terms AS (
        SELECT websearch_to_tsquery('simple', ${q}) AS query
      ), matches AS MATERIALIZED (
        SELECT d."id",
          ts_rank_cd(
            to_tsvector('simple', COALESCE(d."name", '') || ' ' || COALESCE(d."description", '')),
            terms.query
          ) AS score
        FROM "Dish" AS d CROSS JOIN terms
        WHERE d."isPublished" = true ${categoryClause}
          AND to_tsvector('simple', COALESCE(d."name", '') || ' ' || COALESCE(d."description", '')) @@ terms.query
      ), total AS (
        SELECT COUNT(*) AS total FROM matches
      ), page AS (
        SELECT "id", row_number() OVER (ORDER BY score DESC, "id" ASC) AS position
        FROM matches ORDER BY score DESC, "id" ASC
        OFFSET ${offset} LIMIT ${pageSize}
      )
      SELECT total.total, page."id" FROM total LEFT JOIN page ON true
      ORDER BY page.position ASC NULLS LAST
    `;
    return hydrateDishPage(db, rows, page, pageSize);
  }

  return db.$transaction(async (transaction) => {
    // SET LOCAL must share the connection and transaction with the trigram operator.
    await transaction.$executeRawUnsafe('SET LOCAL pg_trgm.similarity_threshold = 0.3');
    const rows = await transaction.$queryRaw`
      WITH matches AS MATERIALIZED (
        SELECT d."id", extensions.similarity(d."name", ${q}) AS score
        FROM "Dish" AS d
        WHERE d."isPublished" = true ${categoryClause}
          AND d."name" OPERATOR(extensions.%) ${q}
      ), total AS (
        SELECT COUNT(*) AS total FROM matches
      ), page AS (
        SELECT "id", row_number() OVER (ORDER BY score DESC, "id" ASC) AS position
        FROM matches ORDER BY score DESC, "id" ASC
        OFFSET ${offset} LIMIT ${pageSize}
      )
      SELECT total.total, page."id" FROM total LEFT JOIN page ON true
      ORDER BY page.position ASC NULLS LAST
    `;
    return hydrateDishPage(transaction, rows, page, pageSize);
  });
}

function createDishModel(db) {
  return {
    async listPublic({ categoryId = '', q = '', mode = 'combined', minPrice, maxPrice, available, page = 1, pageSize = 6 } = {}) {
      const searchText = String(q || '').trim();
      if (mode !== 'combined') {
        return listPublicSearchMode(db, { mode, categoryId, q: searchText, minPrice, maxPrice, available, page, pageSize });
      }
      if (searchText) {
        const { canFuzzyMatch, canFuzzyMatchDescription } = fuzzySearchOptions(searchText);
        const categoryFilter = categoryId
          ? Prisma.sql`AND d."categoryId" = CAST(${categoryId} AS uuid)`
          : Prisma.empty;
        const fuzzyMatches = canFuzzyMatch ? Prisma.sql`
            UNION ALL

            SELECT d."id", d."isFeatured" AS is_featured, d."name", 20 AS match_tier,
              extensions.similarity(extensions.unaccent(d."name"), extensions.unaccent(q.search_text)) AS similarity_score
            FROM "Dish" AS d
            CROSS JOIN parsed_query AS q
            WHERE d."isPublished" = true
              ${categoryFilter}
              AND extensions.similarity(extensions.unaccent(d."name"), extensions.unaccent(q.search_text)) >= 0.4

            ${canFuzzyMatchDescription ? Prisma.sql`
              UNION ALL

              SELECT d."id", d."isFeatured" AS is_featured, d."name", 25 AS match_tier,
                extensions.word_similarity(extensions.unaccent(q.search_text), extensions.unaccent(d."description")) AS similarity_score
              FROM "Dish" AS d
              CROSS JOIN parsed_query AS q
              WHERE d."isPublished" = true
                ${categoryFilter}
                AND extensions.word_similarity(extensions.unaccent(q.search_text), extensions.unaccent(d."description")) >= 0.68
            ` : Prisma.empty}

            UNION ALL

            SELECT d."id", d."isFeatured" AS is_featured, d."name", 30 AS match_tier,
              extensions.similarity(extensions.unaccent(i."name"), extensions.unaccent(q.search_text)) AS similarity_score
            FROM "Ingredient" AS i
            JOIN "DishIngredient" AS di ON di."ingredientId" = i."id"
            JOIN "Dish" AS d ON d."id" = di."dishId"
            CROSS JOIN parsed_query AS q
            WHERE d."isPublished" = true
              ${categoryFilter}
              AND extensions.similarity(extensions.unaccent(i."name"), extensions.unaccent(q.search_text)) >= 0.4
          ` : Prisma.empty;
        const matches = await db.$queryRaw`
          WITH parsed_query AS (
            SELECT websearch_to_tsquery('public.menu_search_unaccent', ${searchText}) AS terms,
              ${searchText}::text AS search_text
          ), candidates AS (
            SELECT d."id", d."isFeatured" AS is_featured, d."name",
              CASE
                WHEN to_tsvector('public.menu_search_unaccent', COALESCE(d."name", '')) =
                  to_tsvector('public.menu_search_unaccent', q.search_text) THEN 50
                ELSE 40
              END AS match_tier,
              ts_rank_cd(to_tsvector('public.menu_search_unaccent', COALESCE(d."name", '')), q.terms) AS similarity_score
            FROM "Dish" AS d
            CROSS JOIN parsed_query AS q
            WHERE d."isPublished" = true
              ${categoryFilter}
              AND to_tsvector('public.menu_search_unaccent', COALESCE(d."name", '')) @@ q.terms

            UNION ALL

            SELECT d."id", d."isFeatured" AS is_featured, d."name", 35 AS match_tier,
              ts_rank_cd(to_tsvector('public.menu_search_unaccent', COALESCE(i."name", '')), q.terms) AS similarity_score
            FROM "Ingredient" AS i
            JOIN "DishIngredient" AS di ON di."ingredientId" = i."id"
            JOIN "Dish" AS d ON d."id" = di."dishId"
            CROSS JOIN parsed_query AS q
            WHERE d."isPublished" = true
              ${categoryFilter}
              AND to_tsvector('public.menu_search_unaccent', COALESCE(i."name", '')) @@ q.terms

            UNION ALL

            SELECT d."id", d."isFeatured" AS is_featured, d."name", 30 AS match_tier,
              ts_rank_cd(
                to_tsvector('public.menu_search_unaccent', COALESCE(d."name", '') || ' ' || COALESCE(d."description", '')),
                q.terms
              ) AS similarity_score
            FROM "Dish" AS d
            CROSS JOIN parsed_query AS q
            WHERE d."isPublished" = true
              ${categoryFilter}
              AND to_tsvector('public.menu_search_unaccent', COALESCE(d."name", '') || ' ' || COALESCE(d."description", '')) @@ q.terms

            ${fuzzyMatches}
          ), ranked_candidates AS (
            SELECT "id", is_featured, "name", match_tier, similarity_score,
              row_number() OVER (
                PARTITION BY "id"
                ORDER BY match_tier DESC, similarity_score DESC
              ) AS candidate_rank
            FROM candidates
          ), matches AS MATERIALIZED (
            SELECT "id", is_featured, "name", match_tier, similarity_score
            FROM ranked_candidates
            WHERE candidate_rank = 1
          ), total AS (
            SELECT COUNT(*) AS total FROM matches
          ), page AS (
            SELECT "id", row_number() OVER (
              ORDER BY match_tier DESC, similarity_score DESC,
                is_featured DESC, "name" ASC, "id" ASC
            ) AS position
            FROM matches
            ORDER BY match_tier DESC, similarity_score DESC,
              is_featured DESC, "name" ASC, "id" ASC
            OFFSET ${Math.max(0, (page - 1) * pageSize)}
            LIMIT ${pageSize}
          )
          SELECT total.total, page."id"
          FROM total
          LEFT JOIN page ON true
          ORDER BY page.position ASC NULLS LAST
        `;
        const total = Number(matches[0]?.total || 0);
        const ids = matches.map(({ id }) => id).filter(Boolean);
        const records = ids.length ? await db.dish.findMany({ where: { id: { in: ids } }, include: dishInclude }) : [];
        const recordsById = new Map(records.map((dish) => [dish.id, dish]));
        return pageResult(ids.map((id) => recordsById.get(id)).filter(Boolean), total, page, pageSize);
      }

      const where = { isPublished: true, ...(categoryId ? { categoryId } : {}) };
      const [items, total] = await Promise.all([
        db.dish.findMany({ where, include: dishInclude, orderBy: [{ isFeatured: 'desc' }, { name: 'asc' }, { id: 'asc' }], skip: (page - 1) * pageSize, take: pageSize }),
        db.dish.count({ where })
      ]);
      return pageResult(items, total, page, pageSize);
    },
    listFeatured(limit = 4) {
      return db.dish.findMany({ where: { isPublished: true, isFeatured: true }, include: dishInclude, orderBy: { name: 'asc' }, take: limit });
    },
    async listAdmin(query = {}) {
      const page = getPage(query);
      const sort = getAdminSort(query, adminSorts, 'updatedAt', 'desc');
      const q = getAdminSearch(query.q);
      const price = {
        ...(query.minPrice !== undefined ? { gte: new Prisma.Decimal(query.minPrice) } : {}),
        ...(query.maxPrice !== undefined ? { lte: new Prisma.Decimal(query.maxPrice) } : {})
      };
      const where = {
        ...(query.categoryIds?.length ? { categoryId: { in: query.categoryIds } } : query.categoryId ? { categoryId: query.categoryId } : {}),
        ...(query.isPublished !== undefined ? { isPublished: query.isPublished } : {}),
        ...(query.isAvailable !== undefined ? { isAvailable: query.isAvailable } : {}),
        ...(query.isFeatured !== undefined ? { isFeatured: query.isFeatured } : {}),
        ...(Object.keys(price).length ? { price } : {}),
        ...(q ? { OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { description: { contains: q, mode: 'insensitive' } },
          { category: { name: { contains: q, mode: 'insensitive' } } },
          { chef: { name: { contains: q, mode: 'insensitive' } } },
          { ingredients: { some: { ingredient: { name: { contains: q, mode: 'insensitive' } } } } }
        ] } : {})
      };
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
