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
| Login | `POST /api/auth/login` | `{ email, password, captchaToken }`; returns `{ accessToken, expiresIn, user }` when MFA is off, or `{ mfaRequired, pendingToken, expiresIn }` when MFA is on. |
| Complete MFA login | `POST /api/auth/mfa/verify-login` | Bearer pending token plus `{ code }`; accepts a TOTP or one-use recovery code and only then issues a full access token and refresh cookie. |
| MFA status | `GET /api/auth/mfa/status` | Full bearer token; returns whether MFA is enabled and the number of unused recovery codes. |
| Start or replace MFA | `POST /api/auth/mfa/setup` | Full bearer token plus `{ password, code? }`; returns a temporary QR image and manual secret. Replacing an enabled factor also requires its current TOTP or recovery code. |
| Confirm MFA setup | `POST /api/auth/mfa/confirm-setup` | Full bearer token plus `{ code }`; activates the factor and returns recovery codes once. |
| Disable MFA | `POST /api/auth/mfa/disable` | Full bearer token plus `{ password, code }`; requires re-authentication. |
| Replace recovery codes | `POST /api/auth/mfa/recovery-codes` | Full bearer token plus `{ password, code }`; invalidates all earlier codes and returns the new set once. |
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

## Error codes and authorization

Missing or rejected reCAPTCHA on registration, resend, login, and password-reset requests returns HTTP 400 with CAPTCHA_REQUIRED. Invalid, expired, or already consumed email codes return HTTP 400 with INVALID_OTP; a locked challenge returns HTTP 429 with OTP_LOCKED. Invalid reset tokens return HTTP 400 with INVALID_RESET_TOKEN. The forgot-password request returns HTTP 202 with the same generic message for known and unknown addresses; configured request limits return HTTP 429 with RATE_LIMITED. Login for a pending account returns the generic HTTP 401 LOGIN_INVALID response and issues no access token or refresh cookie.

The API, not route guards, enforces access to every /api/admin route. An MFA pending token is accepted only by the login verification endpoint and is never accepted by `/api/auth/me`, refresh, or admin APIs. TOTP seeds are encrypted at rest with the server-only `MFA_ENCRYPTION_KEY`; recovery codes are stored as hashes. Codes are single-use, rate limited per account and IP, and a successful password reset does not disable MFA. The server loads the active account and role from the database on each request; the current audited policy permits both viewer and admin roles. Registration ignores any submitted role and creates viewer accounts. Reservation submission remains a public endpoint.

TOTP uses the server operating system clock and the authenticator device clock. Configure automatic time synchronization on the server (NTP) and the authenticator device. The verifier accepts the current 30-second step and one neighboring step on either side; accepted steps cannot be reused. If the device clock is far out of sync, correct it and use a new code or an unused recovery code. The application cannot synchronize the clock of a separate authenticator device.
