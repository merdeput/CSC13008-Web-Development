-- Keep the existing rows and make Vietnamese accent folding available to search.
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;

CREATE TEXT SEARCH CONFIGURATION public.menu_search_unaccent (
  COPY = pg_catalog.simple
);

ALTER TEXT SEARCH CONFIGURATION public.menu_search_unaccent
  ALTER MAPPING FOR hword, hword_part, word
  WITH extensions.unaccent, pg_catalog.simple;

-- These indexes use the same expressions as the accent-aware public query.
CREATE INDEX IF NOT EXISTS "Dish_public_name_unaccent_search_gin_idx"
  ON "Dish" USING GIN (
    to_tsvector('public.menu_search_unaccent', COALESCE("name", ''))
  )
  WHERE "isPublished" = true;

CREATE INDEX IF NOT EXISTS "Dish_public_text_unaccent_search_gin_idx"
  ON "Dish" USING GIN (
    to_tsvector(
      'public.menu_search_unaccent',
      COALESCE("name", '') || ' ' || COALESCE("description", '')
    )
  )
  WHERE "isPublished" = true;

CREATE INDEX IF NOT EXISTS "Ingredient_name_unaccent_search_gin_idx"
  ON "Ingredient" USING GIN (
    to_tsvector('public.menu_search_unaccent', COALESCE("name", ''))
  );

ANALYZE "Dish";
ANALYZE "Ingredient";
