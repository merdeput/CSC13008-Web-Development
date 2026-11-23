# Wildlife Photo Gallery

React + Express gallery with Supabase Postgres for metadata and SeaweedFS for image objects.

## Requirements

- Node.js 24 LTS or newer supported release
- npm
- Supabase Postgres for metadata
- Docker Desktop for local SeaweedFS image storage

## Setup

1. Copy `.env.example` to `.env` and set the database URLs. During migration, keep the server-only Supabase Storage settings until the old objects are retired.
2. Install dependencies with `npm install`.
3. Run `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/setup-seaweedfs.ps1`. This creates ignored local S3 credentials and appends them to `.env`.
4. Run `docker compose -f compose.seaweedfs.yml up -d`, then `node scripts/create-seaweed-buckets.mjs` and `node scripts/check-seaweed-access.mjs`.
5. Apply database migrations with `npm run db:migrate`, then start the API and client with `npm run dev`.
6. Open the Vite URL in the terminal.

`STORAGE_BACKEND=seaweedfs` selects SeaweedFS for new uploads, deletes, and gallery image URLs. Only set it after `node server/dist/scripts/migrate-seaweed.js --copy` and a clean audit without `--copy`. The Supabase secret is needed only while copying old objects; never add storage credentials to a `VITE_` variable or client source. Keep originals private and sanitized variants public for the shared board. `GET /api/health` checks database connectivity.

The local media URL is `http://127.0.0.1:8333`; it works only on the same computer. Deployment needs a persistent SeaweedFS host and HTTPS media URL. Bucket administration credentials live in ignored `seaweedfs/admin.env`, separate from the app's `.env`. Back up the `photo-gallery_seaweed-data` Docker volume, `seaweedfs/s3.json`, and `seaweedfs/admin.env` before removing Supabase Storage copies. Restore into a fresh volume and re-run the access and checksum audits. The migration plan is in [SEAWEEDFS_PLAN.md](SEAWEEDFS_PLAN.md).

## Accounts and shared board

Anyone can browse the shared board, profiles, and sanitized photo variants. Users register with a unique username and a password of at least 8 characters. Passwords are hashed with Node's `scrypt`; the original password is never stored. Sessions use a random, revocable token in an HTTP-only, SameSite=Lax cookie. Mutating requests require a CSRF token and same-origin checks. Set `NODE_ENV=production` behind HTTPS so session cookies include `Secure`.

Signed-in users can upload photos and delete only photos they own. Photo ownership is assigned by the server from the session, not from request metadata. Public profiles expose username, display name, bio, avatar URL, join date, and ready photos; they never expose session or password fields. The account UI currently has no self-service password recovery because accounts do not collect email or phone details.

The account migration assigns existing ownerless or unrecognized-owner photos to a non-login `gallery` archive profile so they remain on the shared board. This archive profile cannot sign in.

## Commands

- `npm run dev` — start API and client
- `npm run build` — build all workspaces
- `npm test` — run the Vitest suite
- `npm run lint` — run ESLint
- `npm run db:generate` — regenerate the Prisma client
- `npm run db:migrate` — deploy pending migrations

The initial and gallery metadata migrations are in `prisma/migrations/`. Image bytes are stored in SeaweedFS buckets; Postgres stores keys, dimensions, checksums, and metadata.
