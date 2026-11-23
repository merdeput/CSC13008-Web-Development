ALTER TABLE "photos" ADD COLUMN "current_version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "photo_variants" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
DROP INDEX IF EXISTS "photo_variants_photo_id_width_target_key";
CREATE UNIQUE INDEX "photo_variants_photo_id_version_width_target_key" ON "photo_variants"("photo_id", "version", "width_target");
CREATE INDEX "photo_variants_photo_id_version_idx" ON "photo_variants"("photo_id", "version");
