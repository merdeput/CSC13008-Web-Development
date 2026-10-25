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
| `npm.cmd run build` | Build the React client |
| `npm.cmd start` | Start Express and serve the production build |
| `npm.cmd run db:generate` | Generate the Prisma client |
| `npm.cmd run db:validate` | Validate the Prisma schema |
| `npm.cmd run db:status` | Check migration status |
| `npm.cmd run db:deploy` | Apply pending migrations |

## Database

The app uses the existing PostgreSQL database and data. The schema includes dishes, categories, chefs, ingredients, dish-ingredient links, and reservations. A dish can have one chef and multiple ingredients.

The additive migration adds a nullable chef relationship to dishes. Existing dishes remain unassigned until linked in the admin form. Migration commands do not seed or reset data.

## API

Successful responses use `{"ok":true,"data":...}`. Errors use `{"ok":false,"error":"..."}`.

Public endpoints include:

- `GET /api/health`, `/api/home`, `/api/menu`, `/api/dishes/:id`, `/api/chefs`, and `/api/config`
- `POST /api/reservations`

Admin endpoints are under `/api/admin` and cover the dashboard, dishes, categories, chefs, ingredients, and reservations. Categories support `GET`, `POST`, `PATCH /:id`, and `DELETE /:id`; categories assigned to a dish cannot be deleted. CORS uses `CLIENT_ORIGIN`, defaulting to `http://localhost:5173`.

## API smoke checks

With the server running, use `curl.exe` in PowerShell:

```powershell
$apiBase = "http://localhost:3000"
curl.exe -i "$apiBase/api/health"
curl.exe -i "$apiBase/api/menu?q=__no_such_dish__"
curl.exe -i "$apiBase/api/dishes/not-a-uuid"
curl.exe -i -X POST "$apiBase/api/reservations" -H "Content-Type: application/json" --data-raw '{"customerName":"","phone":"x","guestCount":0,"date":"bad","time":"99:99"}'
```

Expect HTTP 200 for health and an empty menu result, HTTP 404 for the malformed dish ID, and HTTP 400 for the invalid reservation.
