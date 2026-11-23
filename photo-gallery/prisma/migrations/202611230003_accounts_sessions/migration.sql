CREATE TABLE "users" (
  "id" UUID NOT NULL,
  "username" TEXT NOT NULL,
  "username_normalized" TEXT NOT NULL,
  "password_hash" TEXT,
  "display_name" TEXT,
  "bio" TEXT,
  "avatar_url" TEXT,
  "is_system" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "users_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "users_username_format" CHECK ("username" ~ '^[A-Za-z0-9_]{3,24}$'),
  CONSTRAINT "users_username_normalized_lowercase" CHECK ("username_normalized" = lower("username"))
);
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");
CREATE UNIQUE INDEX "users_username_normalized_key" ON "users"("username_normalized");

CREATE TABLE "user_sessions" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "token_hash" TEXT NOT NULL,
  "csrf_token" TEXT NOT NULL,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "user_sessions_token_hash_key" ON "user_sessions"("token_hash");
CREATE INDEX "user_sessions_user_id_expires_at_idx" ON "user_sessions"("user_id", "expires_at");
CREATE INDEX "user_sessions_expires_at_idx" ON "user_sessions"("expires_at");
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Preserve attribution for any existing ownerless photos without inventing a login account.
INSERT INTO "users" ("id", "username", "username_normalized", "password_hash", "display_name", "is_system", "updated_at")
VALUES ('00000000-0000-4000-8000-000000000001', 'gallery', 'gallery', NULL, 'Gallery archive', true, CURRENT_TIMESTAMP);
UPDATE "photos" AS photo
SET "owner_id" = '00000000-0000-4000-8000-000000000001'
WHERE photo."owner_id" IS NULL
   OR NOT EXISTS (SELECT 1 FROM "users" AS app_user WHERE app_user."id" = photo."owner_id");
ALTER TABLE "photos" ADD CONSTRAINT "photos_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_sessions" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "users", "user_sessions" FROM anon, authenticated;
