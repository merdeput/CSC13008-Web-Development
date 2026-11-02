# Authentication setup

The app uses server-rendered Express/EJS forms, PostgreSQL through Prisma, and `express-session`. Public signup creates a pending account with the server-assigned `viewer` role. For this version, every active authenticated account has the same `/admin` access; the role is recorded but does not authorize or deny actions.

## Environment configuration

Configure these values in the server environment (and locally in the untracked `.env` file):

| Variable | Purpose |
| --- | --- |
| `SESSION_SECRET` | Signs the opaque session ID cookie; use at least 32 random bytes. |
| `OTP_HMAC_SECRET` | HMAC key for activation OTP digests; use a separate value with at least 32 random bytes. |
| `LOGIN_COUNTER_HMAC_SECRET` | HMAC key for email/IP login counter keys; use a separate value with at least 32 random bytes. |
| `RESEND_API_KEY` | Server-side key for Resend's email API. |
| `EMAIL_FROM` | Sender address at a sending domain verified with Resend. |
| `PUBLIC_BASE_URL` | Public origin used to build password-reset links; use HTTPS in production. |
| `RECAPTCHA_SITE_KEY` | Public Google reCAPTCHA v2 checkbox key. |
| `RECAPTCHA_SECRET_KEY` | Private key used for server-side `siteverify`. |
| `RECAPTCHA_ALLOWED_HOSTNAMES` | Comma-separated allowed hostnames from Google's verification response. |

Create separate reCAPTCHA keys for development and production. Registration, activation resend, login, and password-reset requests verify CAPTCHA on the server. A missing/invalid token blocks the request; a Google verification outage fails closed. Google may pass the checkbox directly or show an image challenge based on its risk assessment.

Verify the sender domain in Resend and configure its DNS records before expecting OTP or reset email delivery. The app calls Resend's HTTPS API directly, so the host needs outbound HTTPS access. Never put the API key or reCAPTCHA secret in browser code.

## Registration and activation

`POST /register` normalizes the email, validates the password, verifies reCAPTCHA, hashes the password with scrypt, then creates a `PENDING` user with role `viewer` and an `ACTIVATION` challenge. Role values from the request are ignored. Existing and new addresses receive the same public response.

Submitting registration again for an address that already has a pending account does not send another code. Continue on the activation page and use its resend form; resend is subject to the 60-second cooldown and per-account limit. This also applies when a previous email delivery failed after the pending account and challenge were saved.

Activation codes are six random digits. The database stores only an HMAC digest tied to the challenge ID. Codes expire after 10 minutes. Wrong attempts are counted in PostgreSQL; every fifth consecutive wrong attempt starts a 15-minute lock. `POST /activate/resend` replaces the code after a 60-second cooldown without resetting the attempt count. Successful activation sets the user to `ACTIVE`, records `emailVerifiedAt`, and marks the challenge used. It does not log the user in; the user must visit `/login`.

## Login, sessions, and logout

Login requires a valid reCAPTCHA response and an active account. Failed credentials update persistent counters for both normalized email and IP. Ten failures in a 15-minute window lock the corresponding key for 15 minutes. A successful login clears that email's counter; the IP counter remains until its window expires. Solving CAPTCHA alone does not clear either counter.

The browser stores only a signed opaque session ID. PostgreSQL stores the session data, direct `userId`, and expiry in `Session`. Login regenerates the session ID. Production cookies use `__Host-bephoi.sid`, `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, a four-hour idle timeout, and a 12-hour absolute lifetime. Logout is a CSRF-protected POST that deletes the database session and clears the cookie. Password reset revokes all stored sessions for that user.

Every active authenticated account can access the full `/admin` area in this version, including accounts whose stored role is `viewer`. Pending accounts cannot log in or use admin routes. All unauthenticated `/admin` requests redirect with 303 to login.

Serve production over HTTPS. If TLS ends at a reverse proxy, set `TRUST_PROXY=true` only when that proxy is trusted and forwards the client protocol correctly.

## Password reset

`POST /password-reset` returns a generic response whether or not an active account exists. For an active account, the app sends a random 256-bit reset token and stores only its SHA-256 hash. The link expires after 30 minutes and can be used once. Resetting the password invalidates existing database sessions. `PUBLIC_BASE_URL` must point at the browser-accessible application origin.

## Database rollout

Generate the Prisma client and apply migrations after reviewing the existing database migration history:

```powershell
npm.cmd run db:generate
npm.cmd run db:deploy
```

The new migration drops the short-lived `RegistrationChallenge` table, invalidating any old in-progress signup codes, and deletes existing sessions so there are no sessions without the new direct `userId` field. Existing users are migrated as `ACTIVE`; new users default to `PENDING`. Configure `DIRECT_URL` for Prisma CLI migrations. The migration must be applied before running the updated server.

The in-process `express-rate-limit` middleware remains as a secondary request limiter. Persistent failed-login counters and OTP attempt state are stored in PostgreSQL, so they remain effective across app instances. Configure proxy trust carefully so the IP key reflects the actual client.

Registration diagnostics log the request reaching the route, early configuration/CAPTCHA/CSRF/rate-limit blocks, existing-account skips, Resend call start, provider acceptance, and provider error status. Logs omit email addresses, OTPs, CAPTCHA tokens, reset tokens, and credentials.
