CREATE TYPE "PhotoStatus" AS ENUM ('pending', 'ready', 'pending_delete');
CREATE TYPE "CleanupStatus" AS ENUM ('queued', 'running', 'failed');
CREATE TYPE "StoredObjectKind" AS ENUM ('original', 'variant');

CREATE TABLE "photos" (
  "id" UUID NOT NULL,
  "owner_id" UUID,
  "title" TEXT NOT NULL,
  "caption" TEXT,
  "alt_text" TEXT,
  "category" TEXT,
  "photographer_credit" TEXT,
  "location_name" TEXT,
  "permission_confirmed_at" TIMESTAMPTZ(6),
  "status" "PhotoStatus" NOT NULL DEFAULT 'pending',
  "original_bucket" TEXT NOT NULL,
  "original_key" TEXT NOT NULL,
  "original_mime_type" TEXT NOT NULL,
  "original_bytes" BIGINT NOT NULL,
  "original_checksum" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "photos_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "photos_title_nonblank" CHECK (length(trim("title")) > 0),
  CONSTRAINT "photos_original_bytes_positive" CHECK ("original_bytes" > 0)
);

CREATE TABLE "photo_variants" (
  "id" UUID NOT NULL,
  "photo_id" UUID NOT NULL,
  "width_target" INTEGER NOT NULL,
  "width" INTEGER NOT NULL,
  "height" INTEGER NOT NULL,
  "bucket" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "mime_type" TEXT NOT NULL,
  "bytes" BIGINT NOT NULL,
  "checksum" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "photo_variants_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "photo_variants_dimensions_positive" CHECK ("width" > 0 AND "height" > 0),
  CONSTRAINT "photo_variants_bytes_positive" CHECK ("bytes" > 0),
  CONSTRAINT "photo_variants_target_allowed" CHECK ("width_target" IN (480, 960, 1600))
);

CREATE TABLE "photo_stored_objects" (
  "id" UUID NOT NULL,
  "photo_id" UUID NOT NULL,
  "bucket" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "kind" "StoredObjectKind" NOT NULL,
  "uploaded_at" TIMESTAMPTZ(6),
  CONSTRAINT "photo_stored_objects_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "storage_cleanup_jobs" (
  "id" UUID NOT NULL,
  "photo_id" UUID NOT NULL,
  "status" "CleanupStatus" NOT NULL DEFAULT 'queued',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "next_attempt_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lease_until" TIMESTAMPTZ(6),
  "last_error" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "storage_cleanup_jobs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "storage_cleanup_jobs_attempts_nonnegative" CHECK ("attempts" >= 0)
);

CREATE TABLE "tags" (
  "id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "photo_tags" (
  "photo_id" UUID NOT NULL,
  "tag_id" UUID NOT NULL,
  CONSTRAINT "photo_tags_pkey" PRIMARY KEY ("photo_id", "tag_id")
);

CREATE UNIQUE INDEX "photos_original_key_key" ON "photos"("original_key");
CREATE INDEX "photos_status_created_at_id_idx" ON "photos"("status", "created_at" DESC, "id" DESC);
CREATE INDEX "photos_owner_id_created_at_idx" ON "photos"("owner_id", "created_at" DESC);
CREATE INDEX "photos_category_created_at_idx" ON "photos"("category", "created_at" DESC);
CREATE UNIQUE INDEX "photo_variants_key_key" ON "photo_variants"("key");
CREATE UNIQUE INDEX "photo_variants_photo_id_width_target_key" ON "photo_variants"("photo_id", "width_target");
CREATE INDEX "photo_variants_photo_id_width_idx" ON "photo_variants"("photo_id", "width");
CREATE UNIQUE INDEX "photo_stored_objects_bucket_key_key" ON "photo_stored_objects"("bucket", "key");
CREATE INDEX "photo_stored_objects_photo_id_uploaded_at_idx" ON "photo_stored_objects"("photo_id", "uploaded_at");
CREATE UNIQUE INDEX "storage_cleanup_jobs_photo_id_key" ON "storage_cleanup_jobs"("photo_id");
CREATE INDEX "storage_cleanup_jobs_status_next_attempt_at_idx" ON "storage_cleanup_jobs"("status", "next_attempt_at");
CREATE UNIQUE INDEX "tags_name_key" ON "tags"("name");
CREATE UNIQUE INDEX "tags_slug_key" ON "tags"("slug");
CREATE INDEX "photo_tags_tag_id_photo_id_idx" ON "photo_tags"("tag_id", "photo_id");

ALTER TABLE "photo_variants" ADD CONSTRAINT "photo_variants_photo_id_fkey" FOREIGN KEY ("photo_id") REFERENCES "photos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "photo_stored_objects" ADD CONSTRAINT "photo_stored_objects_photo_id_fkey" FOREIGN KEY ("photo_id") REFERENCES "photos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "storage_cleanup_jobs" ADD CONSTRAINT "storage_cleanup_jobs_photo_id_fkey" FOREIGN KEY ("photo_id") REFERENCES "photos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "photo_tags" ADD CONSTRAINT "photo_tags_photo_id_fkey" FOREIGN KEY ("photo_id") REFERENCES "photos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "photo_tags" ADD CONSTRAINT "photo_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "photos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "photo_variants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "photo_stored_objects" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "storage_cleanup_jobs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tags" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "photo_tags" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "photos", "photo_variants", "photo_stored_objects", "storage_cleanup_jobs", "tags", "photo_tags" FROM anon, authenticated;
