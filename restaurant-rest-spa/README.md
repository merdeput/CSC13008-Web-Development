# Bếp Phố Hội An

A React single-page application with React Router, an Express REST API, and a PostgreSQL database accessed through Prisma.

## Run locally

Use Node.js 20.19 or newer. Create `.env` from `.env.example` and set `DATABASE_URL`. Set `DIRECT_URL` if migrations should use a direct database connection. Keep database credentials private.

Install dependencies and start the API:

```powershell
npm.cmd install
npm.cmd run db:generate
npm.cmd run dev:server
```

In a second terminal, start the React app:

```powershell
npm.cmd run dev:client
```

Open `http://localhost:5173`. Vite forwards `/api` requests to Express at `http://localhost:3000`.

For a production build, run `npm.cmd run build`, then `npm.cmd start`. Express serves the built client and API on port 3000.

## Common commands

| Command | Purpose |
| --- | --- |
| `npm.cmd run dev:server` | Start Express in watch mode |
| `npm.cmd run dev:client` | Start the Vite development server |
| `npm.cmd test` | Run server unit tests and React auth API mock tests |
| `npm.cmd run build` | Build the React client |
| `npm.cmd start` | Start Express and serve the production build |
| `npm.cmd run db:generate` | Generate the Prisma client |
| `npm.cmd run db:validate` | Validate the Prisma schema |
| `npm.cmd run db:status` | Check migration status |
| `npm.cmd run db:deploy` | Apply pending migrations |
| `npm.cmd run db:seed:1000-dishes` | Recreate the 1,000 generated dishes |
| `npm.cmd run db:verify:block7` | Run read-only Block 7 checks against the configured database and local API |

## Database

The app uses the existing PostgreSQL database and data. The schema includes dishes, categories, chefs, ingredients, dish-ingredient links, and reservations. A dish can have one chef and multiple ingredients.

The chef migration adds a nullable chef relationship to dishes. The SPA authentication tables are added by separate additive JWT session and TOTP MFA migrations. Existing dishes remain unassigned until linked in the admin form. Review migration plans before applying them to a shared or production database. Migration commands do not seed or reset data.

Authentication migrations are separate. The JWT session migration is additive, but the inspected database has historical migration checksum mismatches. Reconcile the recorded history before running `db:deploy`; do not reset the database to resolve them.

## API

Successful responses use `{"ok":true,"data":...}`. Validation and not-found responses use `{"ok":false,"error":{"code":"...","message":"..."}}`; validation errors also include a `fields` map.

Public endpoints include:

- `GET /api/health`, `/api/home`, `/api/menu`, `/api/dishes`, `/api/dishes/:id`, `/api/chefs`, and `/api/config`
- `POST /api/reservations`

`GET /api/dishes` is an unauthenticated alias of the searchable, paginated `/api/menu` endpoint. Reservations remain available without an account.

### SPA authentication

The React SPA keeps its 15-minute access JWT in JavaScript memory and sends it as a bearer token to `/api/admin/**`. Refresh uses a rotating opaque HttpOnly cookie. Authentication mutations require the signed CSRF value in X-CSRF-Token and a trusted Origin. Registration and OTP verification do not sign in the user. Registration always creates `viewer`, and the audited policy grants both `viewer` and `admin` access to the admin UI after login. All admin API routes require a valid active-account JWT. See [client/AUTHENTICATION.md](client/AUTHENTICATION.md) for endpoint response shapes, required configuration, evidence scenarios, and the reset policy.

`GET /api/menu` accepts `page`, `pageSize` (1–100; defaults to 6), `categoryId`, `q`, and these search modes:

| `mode` | Search behavior |
| --- | --- |
| `basic` | Case-insensitive literal substring in dish names; blank `q` lists dishes. |
| `advanced` | The same name search plus optional `categoryId`, `minPrice`, `maxPrice`, and `available=true/false`, combined with AND. Blank `q` omits the name condition. |
| `fulltext` | PostgreSQL `simple` full-text search over dish name and description. A nonempty `q` is required. |
| `fuzzy` | `pg_trgm` dish-name similarity at threshold 0.3, set inside the query transaction. A nonempty `q` is required. |

The menu UI sends a named mode. Omitting `mode` preserves the earlier combined full-text/fuzzy search for existing API links. All four named modes search the published dish collection before server-side pagination and return `items`, `total`, `page`, `pageSize`, and `pageCount`. Search results in `fulltext` and `fuzzy` order by score descending, then dish ID ascending. Invalid advanced filters and blank full-text/fuzzy queries return `VALIDATION_FAILED`.

Admin endpoints are under `/api/admin` and cover the dashboard, dishes, categories, chefs, ingredients, and reservations. They require a valid `Authorization: Bearer <accessToken>` header. The backend checks the user's active status and session on each request. The audited policy allows active verified viewer and admin accounts to use the admin UI; the server loads role and account status from the database for each protected request. Categories support `GET`, `POST`, `PATCH /:id`, and `DELETE /:id`; categories assigned to a dish cannot be deleted. CORS uses `CLIENT_ORIGIN`, defaulting to `http://localhost:5173`.

## Authentication

The access JWT is returned in JSON and held only in client JavaScript memory. The opaque refresh token stays in an HttpOnly cookie. Unsafe requests first obtain `GET /api/auth/csrf`, then send `X-CSRF-Token`; the backend also validates the `Origin`. Set `MFA_ENCRYPTION_KEY` to a unique base64url-encoded 32-byte random key in each environment; generate one with `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"`. TOTP seeds are encrypted with AES-256-GCM; keep this key outside the database and back it up securely. The client auth endpoints and response shapes are documented in [client/AUTHENTICATION.md](client/AUTHENTICATION.md).

Users can enroll from **Admin → Security**. Enrollment remains pending until an authenticator code verifies. MFA login creates a five-minute restricted pending session with no refresh cookie; protected APIs accept only the full session issued after TOTP or a single-use recovery code succeeds. Authenticator codes are accepted for the current or immediately previous 30-second step, consumed once, and account-locked for 15 minutes after five invalid attempts. Recovery codes are displayed once and stored as SHA-256 hashes. Password resets leave the MFA factor enabled.

Set `VITE_RECAPTCHA_SITE_KEY` to the same public site key as `RECAPTCHA_SITE_KEY` so Vite can load the browser widget. Keep `RECAPTCHA_SECRET_KEY`, JWT signing keys, CSRF HMAC secret, OTP HMAC secret, and database credentials on the server only. Local development uses the Vite `/api` proxy; deployed browser and API origins must satisfy the backend CORS allow-list and same-site cookie requirements.

The 1,000-dish seed data uses menu-style names, dish descriptions, and curated food photos. One generated dish has a zero price for filter checks. To preview seed changes, run `npm run db:seed:1000-dishes -- --dry-run`. To preview the one-time update for previously generated `Món mẫu` records, run `npm run db:clean:1000-dishes -- --dry-run`. Apply only those name, description, and photo updates with `npm run db:clean:1000-dishes -- --apply`.

## API smoke checks

With the server running, use `curl.exe` in PowerShell:

```powershell
$apiBase = "http://localhost:3000"
curl.exe -i "$apiBase/api/health"
curl.exe -i "$apiBase/api/menu?q=__no_such_dish__"
curl.exe -i "$apiBase/api/dishes/not-a-uuid"
curl.exe -i -X POST "$apiBase/api/reservations" -H "Content-Type: application/json" --data-raw '{"customerName":"","phone":"x","guestCount":0,"date":"bad","time":"99:99"}'
```

Expect HTTP 200 for health and an empty menu result. The malformed dish ID and invalid reservation also use HTTP 200, with `ok: false` and respectively `NOT_FOUND` or `VALIDATION_FAILED` in the error envelope. Validation responses include a `fields` map. Unknown API paths return HTTP 404 without `ok`; unexpected server failures return HTTP 500 without `ok`.
