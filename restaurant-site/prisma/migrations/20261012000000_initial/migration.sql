CREATE TYPE "ReservationStatus" AS ENUM ('PENDING', 'CONFIRMED', 'SEATED', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

CREATE TABLE "Category" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" VARCHAR(80) NOT NULL,
  "slug" VARCHAR(120) NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "Category_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Category_sortOrder_check" CHECK ("sortOrder" >= 0)
);

CREATE TABLE "Dish" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "categoryId" UUID NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "slug" VARCHAR(140) NOT NULL,
  "description" VARCHAR(2400) NOT NULL,
  "price" DECIMAL(12,0) NOT NULL,
  "imageUrl" VARCHAR(2048),
  "isPublished" BOOLEAN NOT NULL DEFAULT false,
  "isAvailable" BOOLEAN NOT NULL DEFAULT true,
  "isFeatured" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Dish_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Dish_price_check" CHECK ("price" >= 0)
);

CREATE TABLE "Ingredient" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" VARCHAR(100) NOT NULL,
  CONSTRAINT "Ingredient_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DishIngredient" (
  "dishId" UUID NOT NULL,
  "ingredientId" UUID NOT NULL,
  CONSTRAINT "DishIngredient_pkey" PRIMARY KEY ("dishId", "ingredientId")
);

CREATE TABLE "Chef" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" VARCHAR(120) NOT NULL,
  "title" VARCHAR(140) NOT NULL,
  "bio" VARCHAR(2400),
  "specialty" VARCHAR(180),
  "imageUrl" VARCHAR(2048),
  "isPublished" BOOLEAN NOT NULL DEFAULT false,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Chef_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Chef_sortOrder_check" CHECK ("sortOrder" >= 0)
);

CREATE TABLE "Reservation" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "referenceCode" VARCHAR(20) NOT NULL,
  "customerName" VARCHAR(120) NOT NULL,
  "phone" VARCHAR(40) NOT NULL,
  "email" VARCHAR(254),
  "guestCount" INTEGER NOT NULL,
  "startsAt" TIMESTAMPTZ(6) NOT NULL,
  "status" "ReservationStatus" NOT NULL DEFAULT 'PENDING',
  "customerNote" VARCHAR(1200),
  "adminNote" VARCHAR(1200),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Reservation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Reservation_guestCount_check" CHECK ("guestCount" > 0)
);

CREATE UNIQUE INDEX "Category_name_key" ON "Category"("name");
CREATE UNIQUE INDEX "Category_slug_key" ON "Category"("slug");
CREATE UNIQUE INDEX "Dish_slug_key" ON "Dish"("slug");
CREATE INDEX "Dish_categoryId_idx" ON "Dish"("categoryId");
CREATE INDEX "Dish_isPublished_isFeatured_idx" ON "Dish"("isPublished", "isFeatured");
CREATE UNIQUE INDEX "Ingredient_name_key" ON "Ingredient"("name");
CREATE INDEX "DishIngredient_ingredientId_idx" ON "DishIngredient"("ingredientId");
CREATE INDEX "Chef_isPublished_sortOrder_idx" ON "Chef"("isPublished", "sortOrder");
CREATE UNIQUE INDEX "Reservation_referenceCode_key" ON "Reservation"("referenceCode");
CREATE INDEX "Reservation_startsAt_idx" ON "Reservation"("startsAt");
CREATE INDEX "Reservation_status_startsAt_idx" ON "Reservation"("status", "startsAt");

ALTER TABLE "Dish" ADD CONSTRAINT "Dish_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DishIngredient" ADD CONSTRAINT "DishIngredient_dishId_fkey"
  FOREIGN KEY ("dishId") REFERENCES "Dish"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DishIngredient" ADD CONSTRAINT "DishIngredient_ingredientId_fkey"
  FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
