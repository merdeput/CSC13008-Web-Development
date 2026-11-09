# SPA authentication contract

This document covers only `restaurant-rest-spa` (React client and its REST API).

## Token and session handling

- The API issues a 15-minute access JWT. React keeps it in a JavaScript module variable; it never enters local storage, session storage, IndexedDB, URLs, or persisted Redux state.
- Protected requests send `Authorization: Bearer <accessToken>`.
- The refresh credential is an opaque, rotating token in the `bephoi.refresh` HttpOnly cookie. The database stores only its SHA-256 hash.
- The CSRF value is in the readable `bephoi.csrf` cookie and `X-CSRF-Token` header. Unsafe auth requests use the double-submit check.
- Startup gets CSRF, posts to `/api/auth/refresh`, then calls `/api/auth/me`. A successful refresh rotates its cookie.
- A failed protected request may trigger one shared refresh and one retry. Refresh and other auth calls are not retried recursively. Concurrent tabs use Web Locks when available and an expiring local-storage coordination lease otherwise; the lease contains no credential.
- Logout revokes the refresh token, clears both cookies, clears the in-memory JWT, invalidates private client data, and broadcasts logout without broadcasting tokens. Password reset increments `authVersion` and revokes all refresh tokens, so previously issued access JWTs fail the next API authorization check immediately.

## JSON API contract

Success uses `{"ok":true,"data":...}`. Errors use `{"ok":false,"error":{"code":"...","message":"..."}}`. Auth status codes include `400` for invalid input/OTP/reset token, `401` for missing or invalid authentication, `403` for CSRF or unsupported database roles, and `429` with `RATE_LIMITED` for rate limits.

| Operation | Method and path | Request and response |
| --- | --- | --- |
| CSRF | `GET /api/auth/csrf` | Sets the CSRF cookie; `data.csrfToken` is returned. |
| Register | `POST /api/auth/register` | `{email,password,recaptchaToken}`; always creates role `viewer`; returns a generic message, never a JWT. |
| Verify email | `POST /api/auth/verify-email` | `{email,code}`; invalid, expired, or consumed codes return `400 INVALID_OTP`; success activates the account but does not authenticate it. |
| Resend OTP | `POST /api/auth/resend-otp` | `{email,recaptchaToken}`; generic response for ineligible addresses. |
| Login | `POST /api/auth/login` | `{email,password,recaptchaToken}`; success returns `{accessToken,user}` and sets the refresh cookie. Pending accounts do not receive a token. |
| Forgot password | `POST /api/auth/forgot-password` | `{email,recaptchaToken}`; same `200` response for eligible and unknown addresses; IP limit returns `429 RATE_LIMITED`. |
| Reset password | `POST /api/auth/reset-password` | `{token,password}`; invalid, expired, or consumed tokens return `400 INVALID_RESET_TOKEN`; success returns only a message, never a JWT. Merely opening `/reset?token=...` does not consume the token. |
| Refresh | `POST /api/auth/refresh` | Refresh cookie and CSRF header; response includes a new `accessToken`, and rotates the cookie. |
| Current user | `GET /api/auth/me` | Bearer access JWT; returns `{user}`. |
| Logout | `POST /api/auth/logout` | CSRF header and refresh cookie; revokes the refresh credential and clears auth cookies. |

The migration audit does not define a JWT REST JSON contract for registration, OTP, login, or recovery. The paths and JSON names in this table are the SPA contract implemented together by this client and its REST API; they remain the point to reconcile if a separate REST audit is supplied.

OTP attempts are counted in PostgreSQL. Every fifth consecutive wrong attempt starts a 15-minute lock. Resending replaces the code after a 60-second cooldown and per-account limit, but does not reset the attempt count. OTP digests are HMACs tied to the challenge ID.

Login, registration, OTP resend, and forgot-password all require server-verified reCAPTCHA. CAPTCHA is checked before the operation can create a user, send OTP, authenticate, or issue a reset request. Login checks CAPTCHA before checking the failed-login lockout; after the threshold a missing CAPTCHA still returns `CAPTCHA_REQUIRED`, and a locked request with valid CAPTCHA returns `429 RATE_LIMITED`.

## Authorization and public API

All `/api/admin/**` requests require an active user and a valid bearer JWT. The authentication audit's current policy gives both `viewer` and `admin` access to the admin UI, so both roles are accepted; public registration always creates `viewer`. The database role is authoritative and must match the signed JWT claim. Editing a browser role value does not change it; editing a JWT payload invalidates its signature. Route guards are only presentation and do not replace API checks.

Public menu reads stay available without a token: `GET /api/menu` and `GET /api/dishes` use the same search and pagination handler. `POST /api/reservations` also remains public. CORS allows the configured `CLIENT_ORIGIN`, credentials, and `Authorization` / `X-CSRF-Token` headers so browser preflight can succeed for that exact origin.

## API module ownership

The SPA worktree contains no Block 8 directory or modules to move. Existing screen requests go through `client/src/api.js`, which delegates to the shared JWT-aware `client/src/auth/http.js`; auth endpoint calls are grouped in `client/src/auth/api.js`. Server-side authentication is isolated in `server/src/routes/auth-routes.js`, `server/src/services/auth-service.js`, `server/src/middleware/authentication.js`, and `server/src/middleware/csrf.js`. Existing restaurant data models and services remain in their current modules.

## Configuration and local setup

Copy `.env.example` to `.env`, then set independent random secrets of at least 32 bytes for `JWT_ACCESS_SECRET`, `OTP_HMAC_SECRET`, and `LOGIN_COUNTER_HMAC_SECRET`; configure the reCAPTCHA keys and email provider. `VITE_RECAPTCHA_SITE_KEY` is public. `RECAPTCHA_SECRET_KEY`, JWT/OTP secrets, and database credentials must remain server-only. `PUBLIC_BASE_URL` must point to the SPA origin used in reset links. For a cross-site deployment, set `AUTH_COOKIE_SAME_SITE=none` and serve over HTTPS.

After reviewing the auth migration against the intended database, apply it with `npm.cmd run db:deploy`. Do not run migrations against a production or shared database as part of frontend verification. Run mocked client and service tests with `npm.cmd test`; build with `npm.cmd run build`.

## Evidence checklist

For each API scenario capture the SPA screen, DevTools Network request/response, and Application cookies/storage. Redact bearer values, OTPs, reset tokens, and email addresses. Include a direct API request that bypasses React, plus a read-only database row showing hashes, expiry, `usedAt`, `attempts`, and `role` where applicable. Never include plaintext OTP/reset tokens or secret configuration in evidence. The backend migration must be deployed and real CAPTCHA/email settings available before these can be presented as live integration evidence; mocked client tests are not end-to-end evidence.
