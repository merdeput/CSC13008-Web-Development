# Student management app

React is the browser client and Express owns the JSON REST API. The JSON persistence file is deliberately located only inside `server/data`; the client calls `/api/students` and never reads or writes it.

## Run locally

Use two terminals:

```powershell
cd server
npm install
npm run dev
```

```powershell
cd client
npm install
npm run dev
```

Open the Vite address printed by the second command (normally `http://localhost:5173`). Its development proxy forwards `/api` requests to Express on port 3001.

For a production frontend build, run `npm run build` in `client`. Serve that build behind the Express API (or configure an equivalent reverse proxy) so `/api` remains same-origin.

## API envelope

Successful reads and writes return `{ "data": ... }`; an error returns `{ "error": { "message": "...", "fields": { ... } } }`. Field errors are included for 422 validation responses.

## Assumptions

- Student IDs identify REST resources and are immutable once created; editing changes name, email, date of birth, and major.
- The JSON file is appropriate for this single-process learning project. Concurrent writes are outside its scope.
- Existing SSR records provide the initial seed data and visual direction; this application itself is separate from `SSR-student-list`.
