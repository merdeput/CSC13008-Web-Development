CREATE INDEX IF NOT EXISTS "Dish_public_search_gin_idx"
  ON "Dish" USING GIN (
    to_tsvector('simple', COALESCE("name", '') || ' ' || COALESCE("description", ''))
  )
  WHERE "isPublished" = true;

CREATE INDEX IF NOT EXISTS "Ingredient_name_search_gin_idx"
  ON "Ingredient" USING GIN (
    to_tsvector('simple', COALESCE("name", ''))
  );

CREATE INDEX IF NOT EXISTS "Dish_public_menu_order_idx"
  ON "Dish" ("isFeatured" DESC, "name" ASC, "id" ASC)
  WHERE "isPublished" = true;

CREATE INDEX IF NOT EXISTS "Dish_public_category_menu_order_idx"
  ON "Dish" ("categoryId" ASC, "isFeatured" DESC, "name" ASC, "id" ASC)
  WHERE "isPublished" = true;

ANALYZE "Dish";
ANALYZE "Ingredient";
