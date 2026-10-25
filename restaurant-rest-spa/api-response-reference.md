# API Response Reference

Audited against the route registrations, handlers, services, models, middleware, and client request utility in this repository. Paths below are mounted under `/api`; admin route paths are mounted under `/api/admin`.

## Response contract

Successful handlers return `{"ok":true,"data":...}`. Creates use HTTP 201; reads, updates, and deletes use HTTP 200. Deletes return `data: { "deleted": true }`.

Business errors also use HTTP 200 and the structured envelope below. `fields` maps form field names to messages when the error is input validation:

```json
{"ok":false,"error":{"code":"VALIDATION_FAILED","message":"Dữ liệu không hợp lệ.","fields":{"name":"Tên món là bắt buộc."}}}
```

Missing or unavailable records use `NOT_FOUND`; business constraints use `CONFLICT`. These responses include `ok: false`, so `client/src/api.js` treats HTTP 200 as a failed operation and throws `ApiError` with `code` and `fields`.

Technical failures use HTTP status codes and a plain `{ "error": "..." }` body without `ok`: unknown API paths return 404, malformed JSON returns 400, oversized bodies return 413, rate limits return 429, and unexpected server/database failures return 500. If the API process or connection is unavailable, the browser receives no response.

## Registered endpoint inventory

There are 29 explicitly registered method/path pairs: 7 public (including the inline health route) and 22 admin. Express also answers `HEAD` using a matching `GET` route when no `HEAD` handler is registered; the body is suppressed. `OPTIONS` is handled by the CORS middleware for allowed origins and is not an application router registration. `PUT` is not registered.

The status shown first is the normal successful status. Route-specific failures are in the final column; cross-cutting parser, not-found, and unexpected-error behavior is documented below the table.

### Public API

| Method and path | Success | `data` shape | Route-specific failures | Route and handler references |
|---|---:|---|---|---|
| `GET /api/health` | 200 | `{status: "available"}` | No route-level business failure. | `server/src/app.js` — inline `/api/health` handler |
| `GET /api/home` | 200 | `{dishes: Dish[], chefs: Chef[]}`; up to four featured dishes and up to three published chefs. | Database or other unexpected errors: 500. | `server/src/routes/public-routes.js` — `GET /home`; `server/src/handlers/public-handlers.js` — `home` |
| `GET /api/menu` | 200 | `{items: Dish[], categories: Category[], total: number}`. Query: `categoryId`, `q`; `q` is trimmed and capped at 100 characters by the handler. | Invalid or unknown `categoryId`: HTTP 200 `NOT_FOUND` `{ok:false,error:{code:"NOT_FOUND",message:"<message>"}}`. Unexpected errors: 500. | `public-routes.js` — `GET /menu`; `public-handlers.js` — `menu`; `services/dish-service.js` — `listPublic`; `models/dish-model.js` — `listPublic`, `listCategories` |
| `GET /api/dishes/:id` | 200 | One public Dish with category, chef, and ingredient links. | Malformed UUID, missing dish, or unpublished dish: HTTP 200 `NOT_FOUND` `{ok:false,error:{code:"NOT_FOUND",message:"<message>"}}`. Unexpected errors: 500. | `public-routes.js` — `GET /dishes/:id`; `public-handlers.js` — `dish`; `models/dish-model.js` — `findPublicById` |
| `GET /api/chefs` | 200 | `{items: Chef[], total: number}`; published chefs and their published dishes. | Unexpected errors: 500. | `public-routes.js` — `GET /chefs`; `public-handlers.js` — `chefs`; `models/chef-model.js` — `listPublished` |
| `GET /api/config` | 200 | `{timeZone, openingTime, closingTime, maxPartySize}` from environment values or defaults. | Unexpected errors: 500 through Express error handling. | `public-routes.js` — `GET /config`; `public-handlers.js` — `config`; `lib/restaurant-config.js` — `getRestaurantConfig` |
| `POST /api/reservations` | 201 | `{id, referenceCode, status}`; new requests start as `PENDING`. JSON body is validated by the service. | Invalid fields/date/time: HTTP 200 `VALIDATION_FAILED`. More than five requests per 15-minute window from the same rate-limit key: 429. A final reservation-code uniqueness collision after model retries: HTTP 200 `CONFLICT`. Unexpected/database errors: 500. | `public-routes.js` — limiter and `POST /reservations`; `public-handlers.js` — `createReservation`; `services/reservation-service.js` — `create`; `services/validation.js` — `validateReservationInput`; `models/reservation-model.js` — `create` |

### Admin dashboard and dishes

| Method and path | Success | `data` shape | Route-specific failures | Route and handler references |
|---|---:|---|---|---|
| `GET /api/admin/dashboard` | 200 | `{counts: {dishCount, chefCount, ingredientCount, reservationCount}, upcoming: Reservation[]}`; up to eight upcoming pending/confirmed reservations. | Unexpected/database errors: 500. | `server/src/routes/admin-routes.js` — `GET /dashboard`; `server/src/handlers/admin-handlers.js` — `overview`; `models/admin-model.js` — `overview`; `models/reservation-model.js` — `upcoming` |
| `GET /api/admin/dishes/options` | 200 | `{categories, ingredients, chefs}` for the dish form. | Unexpected/database errors: 500. | `admin-routes.js` — `GET /dishes/options`; `admin-handlers.js` — `dishOptions`; `models/dish-model.js` — `formOptions` |
| `GET /api/admin/dishes` | 200 | `{items, total, page, pageSize, pageCount, sortBy, sortDirection, q}`. Page size is 10. | Unexpected/database errors: 500. Unsupported sort fields fall back to defaults; they do not fail the request. | `admin-routes.js` — `GET /dishes`; `admin-handlers.js` — `dishList`; `models/dish-model.js` — `listAdmin`; `services/pagination.js`; `services/admin-list-sorting.js` |
| `POST /api/admin/dishes` | 201 | Created Dish with category, chef, and ingredient links. | Invalid fields: HTTP 200 `VALIDATION_FAILED`. Malformed or unavailable category/chef/ingredient references: HTTP 200 `NOT_FOUND`. A slug collision that remains after six generation attempts: HTTP 200 `CONFLICT`. Other unexpected errors: 500. | `admin-routes.js` — `POST /dishes`; `admin-handlers.js` — `dishCreate` / `createOne`; `services/dish-service.js` — `create`, `checked`, `validateReferences`; `services/validation.js` — `validateDishInput`; `models/dish-model.js` — `create` |
| `GET /api/admin/dishes/:id` | 200 | One Dish with category, chef, and ingredient links. | Malformed UUID or missing record: HTTP 200 `NOT_FOUND`. Unexpected errors: 500. | `admin-routes.js` — `GET /dishes/:id`; `admin-handlers.js` — `dishDetail` / `sendOne` / `idOrNotFound`; `models/dish-model.js` — `findById` |
| `PATCH /api/admin/dishes/:id` | 200 | Updated Dish with category, chef, and ingredient links. | Invalid fields: HTTP 200 `VALIDATION_FAILED`. Malformed/missing entity or unavailable references: HTTP 200 `NOT_FOUND`. A concurrent unique-slug conflict can map to HTTP 200 `CONFLICT`. Unexpected errors: 500. | `admin-routes.js` — `PATCH /dishes/:id`; `admin-handlers.js` — `dishUpdate` / `updateOne`; `services/dish-service.js` — `update`, `checked`; `models/dish-model.js` — `update` |
| `DELETE /api/admin/dishes/:id` | 200 | `{deleted: true}`. | Malformed UUID or missing record: HTTP 200 `NOT_FOUND`. Unexpected errors: 500. Dish-ingredient join rows cascade on delete in the Prisma schema. | `admin-routes.js` — `DELETE /dishes/:id`; `admin-handlers.js` — `dishDelete` / `deleteOne`; `services/dish-service.js` — `remove`; `models/dish-model.js` — `remove`; `prisma/schema.prisma` — `DishIngredient.dish` |

### Admin chefs and ingredients

| Method and path | Success | `data` shape | Route-specific failures | Route and handler references |
|---|---:|---|---|---|
| `GET /api/admin/chefs/options` | 200 | `{dishes}` for the chef-to-dish assignment picker. | Unexpected/database errors: 500. | `admin-routes.js` — `GET /chefs/options`; `admin-handlers.js` — `chefOptions`; `models/chef-model.js` — `formOptions` |
| `GET /api/admin/chefs` | 200 | `{items, total, page, pageSize, pageCount, sortBy, sortDirection, q}`. Page size is 10. | Unexpected/database errors: 500. Unsupported sort fields fall back to defaults. | `admin-routes.js` — `GET /chefs`; `admin-handlers.js` — `chefList`; `models/chef-model.js` — `listAdmin` |
| `POST /api/admin/chefs` | 201 | Created Chef with its assigned dishes. | Invalid fields, including missing dish IDs: HTTP 200 `VALIDATION_FAILED` with field messages. Other unexpected errors: 500. | `admin-routes.js` — `POST /chefs`; `admin-handlers.js` — `chefCreate` / `createOne`; `services/chef-service.js` — `create`; `services/validation.js` — `validateChefInput`; `models/chef-model.js` — `create`, `assignDishes` |
| `GET /api/admin/chefs/:id` | 200 | One Chef with assigned dish IDs and names. | Malformed UUID or missing record: HTTP 200 `NOT_FOUND`. Unexpected errors: 500. | `admin-routes.js` — `GET /chefs/:id`; `admin-handlers.js` — `chefDetail` / `sendOne` / `idOrNotFound`; `models/chef-model.js` — `findById` |
| `PATCH /api/admin/chefs/:id` | 200 | Updated Chef with assigned dishes. | Invalid fields, including missing dish IDs: HTTP 200 `VALIDATION_FAILED` with field messages. Malformed/missing entity: HTTP 200 `NOT_FOUND`. Unexpected errors: 500. | `admin-routes.js` — `PATCH /chefs/:id`; `admin-handlers.js` — `chefUpdate` / `updateOne`; `services/chef-service.js` — `update`; `models/chef-model.js` — `update`, `assignDishes` |
| `DELETE /api/admin/chefs/:id` | 200 | `{deleted: true}`. | Malformed/missing entity: HTTP 200 `NOT_FOUND`. If Prisma reports a foreign-key violation (`P2003`): HTTP 200 `CONFLICT`. The current schema's dish-to-chef relation is `SET NULL`, so assigned dishes are retained and unassigned. Unexpected errors: 500. | `admin-routes.js` — `DELETE /chefs/:id`; `admin-handlers.js` — `chefDelete` / `deleteOne`; `services/chef-service.js` — `remove`; `prisma/schema.prisma` — `Dish.chef` |
| `GET /api/admin/ingredients` | 200 | `{items, total, page, pageSize, pageCount, sortBy, sortDirection, q}`. Page size is 10. | Unexpected/database errors: 500. Unsupported sort fields fall back to `name`. | `admin-routes.js` — `GET /ingredients`; `admin-handlers.js` — `ingredientList`; `models/ingredient-model.js` — `listAdmin` |
| `POST /api/admin/ingredients` | 201 | Created Ingredient. | Missing/too-long name: HTTP 200 `VALIDATION_FAILED`. Duplicate name is converted from Prisma `P2002` to validation failure HTTP 200 `VALIDATION_FAILED`. Unexpected errors: 500. | `admin-routes.js` — `POST /ingredients`; `admin-handlers.js` — `ingredientCreate` / `createOne`; `services/ingredient-service.js` — `create`; `services/validation.js` — `validateIngredientInput`; `models/ingredient-model.js` — `create` |
| `GET /api/admin/ingredients/:id` | 200 | One Ingredient with linked dish names. | Malformed UUID or missing record: HTTP 200 `NOT_FOUND`. Unexpected errors: 500. | `admin-routes.js` — `GET /ingredients/:id`; `admin-handlers.js` — `ingredientDetail` / `sendOne` / `idOrNotFound`; `models/ingredient-model.js` — `findById` |
| `PATCH /api/admin/ingredients/:id` | 200 | Updated Ingredient. | Missing/too-long name: HTTP 200 `VALIDATION_FAILED`. Duplicate name: HTTP 200 `VALIDATION_FAILED`. Malformed/missing entity: HTTP 200 `NOT_FOUND`. Unexpected errors: 500. | `admin-routes.js` — `PATCH /ingredients/:id`; `admin-handlers.js` — `ingredientUpdate` / `updateOne`; `services/ingredient-service.js` — `update`; `models/ingredient-model.js` — `update` |
| `DELETE /api/admin/ingredients/:id` | 200 | `{deleted: true}`. | Malformed/missing entity: HTTP 200 `NOT_FOUND`. Ingredient still referenced by a dish (`P2003` / `ON DELETE RESTRICT`): HTTP 200 `CONFLICT` with a specific error. Unexpected errors: 500. | `admin-routes.js` — `DELETE /ingredients/:id`; `admin-handlers.js` — `ingredientDelete` / `deleteOne`; `services/ingredient-service.js` — `remove`; `models/ingredient-model.js` — `remove`; `prisma/schema.prisma` — `DishIngredient.ingredient` |

### Admin reservations

| Method and path | Success | `data` shape | Route-specific failures | Route and handler references |
|---|---:|---|---|---|
| `GET /api/admin/reservations` | 200 | `{items, total, page, pageSize, pageCount, filters: {status, from, to}, sortBy, sortDirection}`. Page size is 10. The model applies status/date filters; it does not consume `q`. | Invalid status/date filter syntax or `from > to`: HTTP 200 `VALIDATION_FAILED`. Unexpected/database errors: 500. | `admin-routes.js` — `GET /reservations`; `admin-handlers.js` — `reservationList`; `services/reservation-service.js` — `listAdmin`; `models/reservation-model.js` — `listAdmin` |
| `GET /api/admin/reservations/:id` | 200 | One Reservation. | Malformed UUID or missing record: HTTP 200 `NOT_FOUND`. Unexpected errors: 500. | `admin-routes.js` — `GET /reservations/:id`; `admin-handlers.js` — `reservationDetail` / `sendOne` / `idOrNotFound`; `models/reservation-model.js` — `findById` |
| `PATCH /api/admin/reservations/:id` | 200 | Updated Reservation. | Invalid fields: HTTP 200 `VALIDATION_FAILED`. Malformed/missing entity: HTTP 200 `NOT_FOUND`. Disallowed status transition or concurrent status change: HTTP 200 `CONFLICT`. Unexpected errors: 500. | `admin-routes.js` — `PATCH /reservations/:id`; `admin-handlers.js` — `reservationUpdate` / `updateOne`; `services/reservation-service.js` — `update`, `TRANSITIONS`; `models/reservation-model.js` — `update` |
| `DELETE /api/admin/reservations/:id` | 200 | `{deleted: true}`. | Malformed UUID or missing record: HTTP 200 `NOT_FOUND`. Unexpected errors: 500. | `admin-routes.js` — `DELETE /reservations/:id`; `admin-handlers.js` — `reservationDelete` / `deleteOne`; `services/reservation-service.js` — `remove`; `models/reservation-model.js` — `remove` |

## Cross-cutting responses and failure sources

| Source | Status | JSON body | Notes |
|---|---:|---|---|
| Unknown path or unsupported API method reaching `notFound` | 404 | `{"error":"<message>"}` | `app.use('/api', notFound)` catches unmatched API paths/methods before the SPA fallback. This technical response has no `ok` field. |
| `ValidationError` | 200 | `{"ok":false,"error":{"code":"VALIDATION_FAILED","message":"<message>","fields":{"field":"<field message>"}}}` | `fields` retains the service's field-to-message mapping for inline SPA feedback. |
| Business `HttpError` with not-found code | 200 | `{"ok":false,"error":{"code":"NOT_FOUND","message":"<message>"}}` | Used for malformed or missing entity IDs and unavailable references inside a registered route. |
| Business `HttpError` with conflict code | 200 | `{"ok":false,"error":{"code":"CONFLICT","message":"<message>"}}` | Used for business constraints such as deleting an ingredient still referenced by a dish. |
| Malformed JSON parsed by `express.json` | 400 | `{"error":"<message>"}` | Body-parser errors are technical and omit `ok`. |
| JSON body over the configured 16 KB limit | 413 | `{"error":"<message>"}` | `express.json({limit: '16kb'})` runs before the routers. |
| Prisma unique violation not handled by a service | 200 | `{"ok":false,"error":{"code":"CONFLICT","message":"<message>"}}` | Service-specific handling may instead return a field-level validation error, such as duplicate ingredient name. |
| Prisma missing record not handled by a service | 200 | `{"ok":false,"error":{"code":"NOT_FOUND","message":"<message>"}}` | Many update/delete services map `P2025` to `null`/`false`, then a handler raises this business error. |
| Unexpected application, database, or connection error | 500 | `{"error":"<message>"}` | The server logs a short error label/code, then returns the generic technical response. Missing `DATABASE_URL` also reaches this path on a database request. |
| Reservation rate limit | 429 | `{"error":"<message>"}` | The public router allows five requests per 15 minutes per rate-limit key. |
| Network error or browser-blocked CORS response | No response | No API JSON is available. | `fetch` rejects and `api.js` creates `ApiError` with status `0`. |

Global error handling is registered after API not-found handling and the optional static SPA fallback. `asyncHandler` forwards rejected route-handler promises with `next`; `errorHandler` maps the known errors above. The public config and health handlers are synchronous, while model-backed async public/admin routes use `asyncHandler`.

## Concrete response examples

### Successful reservation request

Request:

```http
POST /api/reservations
Content-Type: application/json
```

```json
{"customerName":"An Nguyen","phone":"0901234567","email":"an@example.com","guestCount":"2","date":"2030-06-20","time":"18:30","customerNote":"Window seat if available"}
```

On success the handler explicitly returns HTTP 201:

```json
{"ok":true,"data":{"id":"<database UUID>","referenceCode":"BH-<8 uppercase hex characters>","status":"PENDING"}}
```

The ID and reference code are generated per record; the code format comes from `models/reservation-model.js` and the initial status is set there.

### Invalid reservation fields

An invalid request returns HTTP 200 with the field names and messages intact:

```json
{"ok":false,"error":{"code":"VALIDATION_FAILED","message":"Vui lòng kiểm tra lại thông tin đã nhập.","fields":{"customerName":"Vui lòng nhập họ tên.","guestCount":"Số khách phải là số nguyên lớn hơn 0."}}}
```

`api()` throws `ApiError` with `code` and `fields`. `ReservationPage` shows each message beside its input and keeps the entered values.

### Missing public dish

`GET /api/dishes/not-a-uuid` fails the handler's UUID check before querying Prisma. This is a business failure, returned with HTTP 200:

```json
{"ok":false,"error":{"code":"NOT_FOUND","message":"Dữ liệu không khả dụng."}}
```

The dish page's `useLoad` state becomes an error and renders the shared `ErrorState`.

### Constraint violation on ingredient deletion

If a dish still references an ingredient, the database relation uses `ON DELETE RESTRICT`. `ingredient-service.remove` maps Prisma `P2003` to a business conflict with HTTP 200:

```json
{"ok":false,"error":{"code":"CONFLICT","message":"Không thể xóa nguyên liệu đang được dùng trong một món ăn."}}
```

The admin delete confirmation page displays the returned message and remains available for a retry or cancel.

### Unknown API path

`GET /api/not-a-route` reaches the explicit API not-found middleware and returns HTTP 404 without the application envelope:

```json
{"error":"Đường dẫn không khả dụng."}
```

A network outage is different: no Express response exists, so `fetch` rejects and `ApiError.status` is `0`.

### Database unavailable while Express is listening

If `DATABASE_URL` is missing or PostgreSQL cannot be reached, a database-backed request such as `GET /api/admin/dishes` returns HTTP 500 without `ok`:

```json
{"error":"Máy chủ chưa thể hoàn tất yêu cầu. Vui lòng thử lại sau."}
```

The client parses the JSON and throws `ApiError` with status 500. If the Express process itself is unavailable, there is no response and status is 0.

### Reservation rate limit

After the configured limit is exceeded, the middleware sends HTTP 429 with a technical response body and no `ok`:

```json
{"error":"Bạn đã gửi nhiều yêu cầu trong thời gian ngắn. Vui lòng thử lại sau."}
```

`ReservationPage.submit` catches the `ApiError` and leaves the field values in place. The limiter responds before `createReservation` runs.

## Frontend handling and CRUD behavior

- `client/src/api.js` (`api`) calls `fetch`, JSON-encodes request bodies, parses a JSON response, and throws `ApiError` when HTTP is not successful or `payload.ok !== true`. It returns `payload.data` to callers. It stores the HTTP status on `ApiError`, but the current views generally render the message rather than the status.
- `client/src/api.js` (`useLoad`) uses `AbortController`, exposes `loading`, `error`, `data`, and `reload`, and ignores an abort caused by route/query changes. Shared `Loading` and `ErrorState` components in `client/src/App.jsx` render these states.
- `ReservationPage.submit` does custom client-side validation and sets field-level `aria-invalid`; both reservation and admin forms display server `fields` errors beside the matching controls and clear each message as that field changes. Admin forms are controlled by React state. A failed request sets a summary without clearing that state; a successful create/update navigates to the resource list.
- Admin create/update uses `POST /api/admin/:resource` and `PATCH /api/admin/:resource/:id`. Reservation creation is public; reservations have an admin edit/update form but no admin create form.
- Admin delete uses `/admin/:resource/:id/delete` confirmation routes. `AdminDeletePage` first loads the entity, calls `DELETE` only from its explicit confirmation button, disables both actions while the request is pending, prevents a second call with a ref lock, renders the success state before redirecting, and shows a failed-delete error without leaving the page. It then navigates to the resource list; cancel uses the prior listing path when supplied, otherwise the relevant list.
- No authentication/authorization middleware is registered around `/api/admin`; the `/admin` prefix is route organization only in the inspected source.

## CORS and preflight behavior

`server/src/app.js` reads `CLIENT_ORIGIN`, splits a comma-separated list, trims entries, and defaults to `http://localhost:5173`. An incoming `Origin` is allowed only if it exactly matches one of these configured origins. The `cors` middleware is installed before JSON parsing and routers, with methods `GET, POST, PATCH, DELETE, OPTIONS` and allowed request header `Content-Type`; credentials are not enabled.

For a matching browser origin such as `http://localhost:5173`, the `cors` package reflects the request origin:

```http
Access-Control-Allow-Origin: http://localhost:5173
Vary: Origin
```

For an allowed preflight, the middleware also returns `Access-Control-Allow-Methods: GET,POST,PATCH,DELETE,OPTIONS` and `Access-Control-Allow-Headers: Content-Type`, then ends with HTTP 204 (the `cors` package default `optionsSuccessStatus`; the app does not override it). JSON POST/PATCH requests and DELETE requests from a different origin require preflight under browser CORS rules.

For a disallowed origin, the origin callback calls back with `false`; the installed `cors` package skips adding CORS headers and continues the Express stack. A simple request can therefore still reach and execute an API handler, but the browser will not expose the response to frontend JavaScript because `Access-Control-Allow-Origin` is absent. A preflighted browser request will not proceed to the actual request when the preflight lacks the required allow headers. This is browser cross-origin policy, not API authentication or server-side authorization. In development Vite proxies `/api` to `http://localhost:3000`; in production Express can serve the built client and API on one origin.

## Architecture evidence

| Concern | Source of truth |
|---|---|
| React mount and BrowserRouter | `client/src/main.jsx` — `createRoot`, `BrowserRouter` |
| SPA route table and components | `client/src/App.jsx` — `App`, `PublicShell`, `AdminShell`, page components |
| Dev proxy | `client/vite.config.js` — `/api` to `http://localhost:3000` |
| Express middleware order, CORS, JSON limit, routers, static fallback | `server/src/app.js` — `createApp` |
| Public/admin registrations | `server/src/routes/public-routes.js` — `createPublicRouter`; `server/src/routes/admin-routes.js` — `createAdminRouter` |
| Response builders and UUID/not-found guards | `server/src/handlers/public-handlers.js` — `createPublicHandlers`; `server/src/handlers/admin-handlers.js` — `createAdminHandlers` |
| Async error forwarding and global JSON error mapping | `server/src/lib/async-handler.js` — `asyncHandler`; `server/src/middleware/error-handler.js` — `notFound`, `errorHandler` |
| Input validation and business rules | `server/src/services/validation.js`; resource service modules in `server/src/services/` |
| Database access and query shapes | resource models in `server/src/models/` |
| ORM schema and relations | `prisma/schema.prisma` |
| PostgreSQL adapter and connection environment | `server/src/lib/prisma.js`, `server/src/lib/postgres-adapter.js`, `.env.example` |


