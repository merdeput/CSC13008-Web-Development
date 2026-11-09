# Migration từ Block 8 SSR session sang React SPA + REST API

**Dự án:** Bếp Phố Hội An

**Nguồn triển khai:** merge commit `3b9032e` trên `main`

**Phạm vi:** Mô tả những gì Block 8 dùng cho SSR, cách trách nhiệm được tách sang API/SPA và thay đổi lưu phiên đăng nhập.

## 1. Tóm tắt

Block 8 là ứng dụng Express SSR dùng EJS và `express-session`. Browser gửi session ID trong cookie; session data được lưu phía server trong PostgreSQL qua Prisma session store. Mỗi lần login, controller ghi user identity và thời hạn vào session. Middleware đọc session và kiểm tra tài khoản trước khi render route quản trị.

SPA/API không chuyển cookie SSR hiện có thành JWT. Nó bổ sung một luồng đăng nhập tách biệt: React giữ access JWT 15 phút trong memory, trình duyệt giữ opaque refresh token trong HttpOnly cookie, còn database giữ AuthSession và hash refresh token. Mọi API quản trị kiểm tra Bearer JWT và AuthSession còn hiệu lực.

Các bản ghi SSR trong bảng `Session` được giữ cho luồng SSR cũ; SPA sử dụng `AuthSession` và `RefreshToken`. Không có endpoint exchange SSR session thành JWT. Người dùng đăng nhập lại trên SPA để tạo phiên JWT mới.

## 2. Block 8 trước migration

| Thành phần | Cách Block 8 thực hiện |
| --- | --- |
| Frontend/rendering | Express render EJS pages. GET auth routes hiển thị form; POST routes render lại hoặc redirect 303. |
| Browser credential | Cookie `bephoi.sid` ở development hoặc `__Host-bephoi.sid` ở production. Cookie HttpOnly, SameSite=Lax, Secure ở production, path `/`. |
| Server session | `express-session` với `PrismaSessionStore`. Bảng `Session` lưu `sid`, serialized `data`, `userId`, `expiresAt`. |
| Session lifetime | Idle lifetime 4 giờ, rolling cookie; absolute auth deadline 12 giờ được lưu trong session và kiểm tra riêng. |
| Identity/authorization | Session chứa userId/email/role. `requireAuthenticated` tải user từ DB và yêu cầu account ACTIVE, email verified, absolute deadline chưa hết hạn. |
| CSRF | Token gắn với session và đặt trong hidden form field `_csrf`; middleware so sánh token của form với session. |
| OTP/reset | Controller gọi auth service; email/OTP/reset flow phản hồi bằng EJS/redirect. Activation kết thúc ở trang login, không tự đăng nhập. |
| Logout | Hủy server session và xóa session cookie. |
| Module | `restaurant-site/src/app.js`, `src/routes/*`, `src/controllers/*`, `src/middleware/authentication.js`, `src/middleware/csrf.js`, `src/lib/prisma-session-store.js`, `src/services/*`, EJS views. |

## 3. Module map: Block 8 sang restaurant-rest-spa

Đây là mapping theo trách nhiệm. Một số module được viết lại cho JSON/React thay vì Git rename một-một.

| Block 8 SSR module | SPA/API tương ứng | Thay đổi |
| --- | --- | --- |
| `restaurant-site/src/app.js` | `restaurant-rest-spa/server/src/app.js` | Tách API runtime; thêm CORS origin allow-list, JSON parser, auth router, public router, admin router, JWT middleware và static serving cho build SPA. |
| `src/routes/auth-routes.js` + `src/controllers/auth-controller.js` | `server/src/routes/auth-routes.js` + `server/src/handlers/auth-handlers.js` | EJS GET/POST routes chuyển thành JSON endpoint: `/api/auth/register`, `/verify-otp`, `/resend-otp`, `/login`, `/refresh`, `/me`, `/logout`, `/password-reset`, `/password-reset/confirm`. Thêm CSRF header, trusted Origin, rate limits và CAPTCHA body token. |
| `views/auth/*.ejs` | `client/src/auth/pages.jsx`, `client/src/auth/recaptcha.jsx` | Form SSR chuyển thành React pages. Register/OTP/login/forgot/reset hoạt động client-side; OTP vẫn không tự login. |
| `src/middleware/authentication.js` | `server/src/middleware/require-access-token.js` | Redirect tới login được thay bằng HTTP 401 JSON. Middleware xác minh Bearer JWT, tra `sid` trong AuthSession và yêu cầu user/session active. |
| `src/lib/prisma-session-store.js` + `express-session` setup | `server/src/services/token-session-service.js`, `server/src/lib/auth-cookies.js` | Không dùng SSR session cookie cho SPA. Mỗi login tạo AuthSession và refresh token opaque; refresh token được rotate và DB chỉ lưu hash. |
| `src/middleware/csrf.js` | `server/src/middleware/csrf.js` | Hidden `_csrf` theo SSR session được thay bằng CSRF endpoint/cookie/header `X-CSRF-Token` và trusted Origin check. |
| `src/routes/customer-routes.js` + `src/controllers/customer-controller.js` | `server/src/routes/public-routes.js` + `server/src/handlers/public-handlers.js` | Response HTML/redirect chuyển thành JSON envelope. GET menu/dishes và POST reservation vẫn public; reservation không đòi Bearer token. |
| `src/routes/admin-routes.js` + `src/controllers/admin-controller.js` | `server/src/routes/admin-routes.js` + `server/src/handlers/admin-handlers.js` | `/admin/...` SSR routes chuyển thành `/api/admin/...`; output JSON. Auth middleware được mount trước toàn bộ router quản trị. |
| `src/services/dish-service.js`, `chef-service.js`, `category-service.js`, `ingredient-service.js`, `reservation-service.js`, `admin-service.js` | `server/src/services/*` và `server/src/models/*` | Duy trì domain operations qua model/service layer; HTTP handler chuyển service result thành JSON. Public menu giữ tìm kiếm/phân trang; reservation vẫn public. |
| `restaurant-site/src/services/auth-service.js` | `shared/auth/auth-service.js`, được gọi bởi `server/src/services/index.js` | Business rules dùng chung, không fork logic mật khẩu/OTP/reset. API wrapper tạo auth service từ Prisma DB models. |
| `restaurant-site/prisma/schema.prisma` auth models | `restaurant-rest-spa/prisma/schema.prisma` và migration JWT mới | User, ActivationChallenge, PasswordReset, LoginFailureCounter và legacy Session vẫn tồn tại; thêm AuthSession/RefreshToken cho SPA. |
| React route state | `client/src/auth/http.js`, `context.jsx`, `route-guards.jsx`, `api.js` | Thêm in-memory JWT manager, refresh/CSRF, single-flight 401 retry, startup restore, logout/cache invalidation và cross-tab coordination. Route guard chỉ dành cho UI; API vẫn xác thực độc lập. |

**Lưu ý:** bảng trên mô tả vị trí module trong hai ứng dụng. Một số file service/model được sao chép/refactor giữa workspaces; không khẳng định mỗi hàng là Git rename nguyên vẹn.

## 4. Cấu trúc token và phiên trong SPA/API

- Access JWT dùng HS256, type `at+jwt`, chứa `sub`, `sid`, `iss`, `aud`, `iat`, `exp`, `jti`; hạn 900 giây.
- Access JWT được trả trong JSON và giữ trong memory của client. Client gửi token trong `Authorization: Bearer`.
- Refresh credential là opaque token, cookie HttpOnly/SameSite=Lax, thời hạn phiên tối đa 7 ngày. Production cookie dùng `__Host-bephoi.rt`; development dùng `bephoi.rt`.
- Bản token thô không lưu database. `RefreshToken.tokenHash` là SHA-256; mỗi lần rotate đánh dấu token trước đã dùng, tạo token mới cùng AuthSession.
- `AuthSession` có `userId`, `createdAt`, `lastUsedAt`, `expiresAt`, `revokedAt`, `revokeReason`. Middleware kiểm tra session và account status trên mỗi protected request.
- Password reset và logout revoke session; token cũ trở thành không hợp lệ ngay cả khi JWT `exp` chưa tới.
- Policy hiện tại cho `viewer` và `admin` cùng truy cập admin UI. Role được lấy từ user database, không từ Local Storage. Route guard không thay thế API authorization.

## 5. Database migration

Migration JWT trong `restaurant-rest-spa/prisma/migrations/20261109010000_add_jwt_refresh_sessions/migration.sql`:

1. Tạo bảng `AuthSession` và `RefreshToken`.
2. Thêm foreign key và index cho user/session, refresh hash và parent token.
3. Thêm check constraint cho thời hạn session/token.
4. Bật Row Level Security trên bảng auth/session hiện có và bảng mới.
5. Revoke quyền `PUBLIC`, `anon`, `authenticated` trên credential/session tables; server cần kết nối bằng private database role.

Migration JWT này không xóa bảng `Session` SSR và không đổi session ID cũ thành JWT. Bảng `Session` được giữ để tương thích với SSR app. Không áp migration vào production chỉ dựa trên test unit.

## 6. Validation và giới hạn còn lại

Đã chạy trên merge commit `3b9032e`: 39 automated tests pass; production SPA build thành công. Migration safety test đọc SQL và kiểm tra tính additive/RLS/revoke. Các test dùng mocks hoặc test doubles; chưa chạy migration trên database thật, chưa xác minh production credentials/email/reCAPTCHA. README hiện ghi nhận checksum mismatch lịch sử; trước `db:deploy` cần reconcile migration history, không reset database.

**Contract mismatch cần giải quyết trước khi tuyên bố refresh đã tích hợp với Prisma thật:** `server/src/services/token-session-service.js` truyền `replacedById` khi cập nhật `RefreshToken`; Prisma model và migration hiện định nghĩa `parentId` cùng quan hệ `successor`, nhưng không định nghĩa `replacedById`. Test refresh hiện dùng DB mock nên không phát hiện field không có trong schema. Hãy sửa một phía (dùng quan hệ `parentId` hiện có hoặc thêm field/migration có chủ đích), rồi kiểm thử với generated Prisma client và database thử nghiệm. Cho tới khi đó, các test hiện có không chứng minh refresh rotation chạy với database thật.
