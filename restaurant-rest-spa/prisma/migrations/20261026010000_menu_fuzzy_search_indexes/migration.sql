CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

CREATE INDEX IF NOT EXISTS "Dish_public_name_trgm_idx"
  ON "Dish" USING GIN ("name" extensions.gin_trgm_ops)
  WHERE "isPublished" = true;

CREATE INDEX IF NOT EXISTS "Dish_public_description_trgm_idx"
  ON "Dish" USING GIN ("description" extensions.gin_trgm_ops)
  WHERE "isPublished" = true;

CREATE INDEX IF NOT EXISTS "Ingredient_name_trgm_idx"
  ON "Ingredient" USING GIN ("name" extensions.gin_trgm_ops);

ANALYZE "Dish";
ANALYZE "Ingredient";
