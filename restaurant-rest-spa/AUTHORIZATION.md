# Authorization

Administrative requests use the current HttpOnly refresh cookie to resolve the active database session and user. Writes require the existing trusted-origin and CSRF checks. Roles are viewer (read), editor (read and create; update assigned draft dishes), and admin (all operations). Unknown roles are denied. Draft means Dish.isPublished is false. Editors cannot assign dishes through chef creation.

Apply the new Prisma migration before running the updated server. Assign editor roles and User.chefId through a trusted database administration process; registration continues to create viewers. An editor without an assigned chef cannot create or update dishes. Role and chef assignments are read from the database for each request.
