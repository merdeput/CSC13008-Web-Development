# React authentication client

The React client keeps the access JWT in a module variable in JavaScript memory. It is not copied into local storage, session storage, IndexedDB, URLs, or persisted application state. The refresh credential stays in the backend's HttpOnly cookie. Authentication state is `loading`, `authenticated`, or `unauthenticated`; a temporary restore network failure keeps protected pages covered in `loading` and shows a retry action.

## Audited behavior used

The available [authentication audit](../../restaurant-site/AUTHENTICATION.md) describes the existing SSR flow: registration creates a pending viewer account, OTP verification does not sign the user in, OTPs expire after ten minutes, resend is rate limited, login and registration/resend/password-reset requests require reCAPTCHA, reset links are one use and expire after 30 minutes, and password reset revokes sessions. The audit predates the JWT REST migration and does not specify REST auth route names, JSON fields, CSRF headers, or the auth response object shapes. Those items below are frontend assumptions to align with the backend implementation.

## REST contract assumptions

All requests use JSON and `credentials: 'include'`. Success uses the repository's `{"ok":true,"data":...}` envelope. Failure uses `{"ok":false,"error":{"code":"...","message":"...","fields":{}}}`. The client also tolerates `{token}` for the CSRF value and `{user: ...}` or a direct user object for `/me`.

| Operation | Method and path | Assumed JSON fields / data |
| --- | --- | --- |
| CSRF | `GET /api/auth/csrf` | `data.csrfToken` |
| Register | `POST /api/auth/register` | `{email,password,recaptchaToken}` |
| Verify email OTP | `POST /api/auth/verify-email` | `{email,code}` |
| Resend OTP | `POST /api/auth/resend-otp` | `{email,recaptchaToken}` |
| Login | `POST /api/auth/login` | `{email,password,recaptchaToken}`; data includes `{accessToken,user}` |
| Forgot password | `POST /api/auth/forgot-password` | `{email,recaptchaToken}`; response is generic |
| Reset password | `POST /api/auth/reset-password` | `{token,password}` |
| Refresh | `POST /api/auth/refresh` | cookie plus `X-CSRF-Token`; data includes `{accessToken}` |
| Current user | `GET /api/auth/me` | Bearer access token; data includes `{user}` |
| Logout | `POST /api/auth/logout` | cookie, optional Bearer token, and `X-CSRF-Token` |

Every unsafe request obtains a CSRF value first and sends it in `X-CSRF-Token`. The three fixed JWT paths are used exactly as specified. The remaining REST paths, `recaptchaToken` JSON field, CSRF header name, and response field names are assumptions because the available audit describes form posts rather than a JWT REST contract. Adjust these in `src/auth/api.js` and `src/auth/http.js` once the backend contract is available.

The React widget reads the public site key from `VITE_RECAPTCHA_SITE_KEY`; the backend must verify that token using its private configuration. The browser never receives the CAPTCHA secret.

## Unresolved contract mismatches

- The legacy audit's activation and resend forms rely on server session state (`pendingActivationUserId` / `pendingActivationEmail`), submit OTP as `code`, and use `/activate` plus `/activate/resend`. This frontend assumes `/verify-email` and `/resend-otp` accept an `email` field. The backend must define how a pending registration is identified in a stateless JWT API before those two forms can be considered integrated.
- The legacy forms send reCAPTCHA as `g-recaptcha-response` and CSRF as a `_csrf` form field. This frontend assumes JSON `recaptchaToken` and an `X-CSRF-Token` header.
- The legacy audit documents SSR redirects and session cookies, not JWT status codes or REST error envelopes. This client assumes a refresh failure is HTTP 401 (or an equivalent unauthorized code), while temporary refresh network/server errors leave the app covered and retryable. The backend should preserve the repository's JSON envelope and return an explicit unauthorized status/code for expired refresh credentials.
- The JWT field (`accessToken`), `/me` user shape, refresh-cookie name/options, role names, and the exact CSRF response/header convention need confirmation against the backend implementation.

## Session and protected data behavior

- Startup performs CSRF acquisition, refresh, then `/api/auth/me`; no refresh cookie means unauthenticated.
- Protected `/api/admin/**` calls attach `Authorization: Bearer <accessToken>`. An eligible 401 triggers one shared refresh and one retry. Refresh/logout endpoints cannot recursively refresh.
- Concurrent 401 responses share a refresh promise. Browsers with Web Locks also serialize cookie rotation across tabs.
- Logout clears in-memory auth and invalidates mounted admin data even if the network request fails. `BroadcastChannel` propagates logout and account changes without broadcasting JWTs.
- Admin React state is cleared on session expiration and account changes. Route guards only shape the UI; server-side authorization remains required.
- The audit says all active accounts, including `viewer`, currently have the same admin access. The UI displays the role and the route guard supports optional role lists, but the admin route does not deny a role based on the legacy audit.

For cross-origin deployments, the backend CORS policy must allow credentials and the `Authorization` and `X-CSRF-Token` headers. The production Helmet CSP must also allow the Google reCAPTCHA script, frame, and connection origins. Same-origin Vite proxy development does not require cross-origin cookies.
