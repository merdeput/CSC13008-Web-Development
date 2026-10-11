# Cohort — student management & team builder

React and Vite render the landing page and workspace in the browser. Express serves the built frontend and the same-origin JSON API. Student data persists in `server/data/students.json`; team assignments stay in the current browser session.

## Run locally

From `CSR-student-list`:

```powershell
cd client
npm install
npm run build
cd ../server
npm install
npm run dev
```

Open `http://localhost:3001`. For frontend development with Vite, run `npm run dev` in `client` in a second terminal; its `/api` proxy points at Express on port 3001. To build the production frontend from the server folder, use `npm run build`.

## API

- `GET /api/students` and `GET /api/students/:id`
- `POST /api/students` creates a normalized record and returns a `Location` header.
- `PATCH /api/students/:id` accepts one or more editable fields (`name`, `email`, `dob`, `major`); IDs cannot change.
- `DELETE /api/students/:id` returns 204 with no body.

API errors use `{ "error": { "code": "...", "message": "...", "fields": {} } }`. DOB is a date-only `YYYY-MM-DD` value. “Today” means the UTC calendar date, consistently in the browser and server.

## Team builder

Assignments are generated locally with Fisher–Yates shuffling or a mix-majors heuristic. The heuristic places an incoming student in a least-populated team that has the fewest members from their major, with randomized ties. It favors variety but does not guarantee a mathematically optimal balance. Locks and swaps last only for the current page session.

JSON-file writes are serialized and committed with an atomic rename. This repository suits a single-process learning project; it is not a multi-process database.
