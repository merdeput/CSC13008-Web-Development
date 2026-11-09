# React JWT authentication client

The access JWT stays in a JavaScript module variable for the current page lifetime. It is not written to local storage, session storage, IndexedDB, URLs, or persisted application state. The refresh token remains in the backend's HttpOnly cookie. On startup, the client obtains a CSRF token, refreshes the session, then loads `/api/auth/me`.

## Backend contract

All API calls use JSON and `credentials: 'include'`. Success responses use `{ "ok": true, "data": ... }`; errors use `{ "ok": false, "error": { "code": "...", "message": "...", "fields": {} } }`.

| Operation | Method and path | JSON fields |
| --- | --- | --- |
| CSRF | `GET /api/auth/csrf` | Returns `data.csrfToken` and sets the CSRF cookie. |
| Register | `POST /api/auth/register` | `{ email, password, captchaToken }` |
| Verify email | `POST /api/auth/verify-otp` | `{ email, code }`; verification requires a later login. |
| Resend OTP | `POST /api/auth/resend-otp` | `{ email, captchaToken }` |
| Login | `POST /api/auth/login` | `{ email, password, captchaToken }`; returns `{ accessToken, expiresIn, user }`. |
| Refresh | `POST /api/auth/refresh` | Refresh cookie and `X-CSRF-Token`; returns a new access token and CSRF token. |
| Current user | `GET /api/auth/me` | Bearer access token; returns the user object directly in `data`. |
| Logout | `POST /api/auth/logout` | CSRF header and cookies, with an optional Bearer token; returns `204`. |
| Request password reset | `POST /api/auth/password-reset` | `{ email, captchaToken }` |
| Confirm password reset | `POST /api/auth/password-reset/confirm` | `{ token, newPassword }` |

Every unsafe request sends the CSRF value in `X-CSRF-Token`. The backend checks both that token and the trusted `Origin`. The API layer retries a request once if a stale CSRF value is rejected. The refresh endpoint rotates the HttpOnly refresh cookie; access tokens are only returned in JSON.

Reset links target `/reset-password#token=...`. The page reads the token from the fragment, removes it from the address bar, and posts it as JSON. The fragment is not sent in the HTTP request or Referer header.

The Google reCAPTCHA widget reads `VITE_RECAPTCHA_SITE_KEY`, which must match the server's `RECAPTCHA_SITE_KEY`. The matching secret is only configured on the backend as `RECAPTCHA_SECRET_KEY`.

## Session and protected data behavior

- Protected `/api/admin/**` calls attach `Authorization: Bearer <accessToken>`. A `401` triggers one shared refresh and one retry.
- Concurrent refreshes share a promise in one tab and use the browser Web Locks API across tabs when available. Cookies are never exposed to JavaScript.
- Logout clears in-memory authentication and private UI data. `BroadcastChannel` propagates logout and account changes without broadcasting JWTs.
- Temporary restore network failures keep protected pages covered by the loading state and allow retry.
- Route guards control presentation only. The backend authenticates `/api/admin`; role and resource authorization remain a separate policy decision. Current behavior preserves the SSR rule that active verified accounts, including `viewer`, can access these routes.

For local development, Vite proxies `/api` to Express, keeping requests same-origin. For deployed cross-origin origins, configure `CLIENT_ORIGIN` and allow credentialed CORS. The backend sets refresh cookies with `SameSite=Lax`; the SPA and API should be same-site for browsers to send them reliably.
