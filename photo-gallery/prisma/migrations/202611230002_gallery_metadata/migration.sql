ALTER TABLE "photos"
  ADD COLUMN "location_continent" TEXT,
  ADD COLUMN "location_region" TEXT,
  ADD COLUMN "location_country" TEXT,
  ADD COLUMN "competition" TEXT,
  ADD COLUMN "award" TEXT,
  ADD COLUMN "photo_year" INTEGER,
  ADD COLUMN "species_common" TEXT,
  ADD COLUMN "species_latin" TEXT,
  ADD COLUMN "story" TEXT;

CREATE INDEX "photos_competition_award_idx" ON "photos"("competition", "award");
CREATE INDEX "photos_photo_year_idx" ON "photos"("photo_year" DESC);
CREATE INDEX "photos_species_common_idx" ON "photos"("species_common");
CREATE INDEX "photos_location_country_idx" ON "photos"("location_country");
