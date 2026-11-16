# Authorization

Administrative requests use the current HttpOnly refresh cookie to resolve the active database session and user. Writes require the existing trusted-origin and CSRF checks. Roles are viewer (read), editor (read and create; update assigned draft dishes), and admin (all operations). Unknown roles are denied. Draft means Dish.isPublished is false. Editors cannot assign dishes through chef creation.

Apply the new Prisma migration before running the updated server. Assign editor roles and User.chefId through a trusted database administration process; registration continues to create viewers. An editor without an assigned chef cannot create or update dishes. Role and chef assignments are read from the database for each request.

## Temporary role switcher

For demonstrations with an isolated test database, set `NODE_ENV=development` and `ENABLE_DEV_ROLE_SETTER=true` in the server environment, then restart the server. After signing in, the admin page shows a temporary switcher for the current account. Select a chef when choosing editor. The switcher writes to the database and reloads the page. It is disabled unless both settings are present, is never mounted when `NODE_ENV=production`, and requires a local connection, a signed-in session, trusted origin, and CSRF token. Remove it before shipping. Do not enable it on a shared database or publicly reachable development server.
