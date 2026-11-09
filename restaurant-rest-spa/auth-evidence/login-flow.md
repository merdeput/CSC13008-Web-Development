# Luồng đăng nhập JWT của React SPA

**Dự án:** Bếp Phố Hội An

**Nguồn:** REST contract và mã SPA/API tại merge commit `3b9032e`

**Mục đích:** Mô tả nơi tạo, truyền, lưu và thu hồi access JWT cùng refresh token.

## Sơ đồ luồng

~~~mermaid
sequenceDiagram
    autonumber
    actor User as Người dùng
    participant SPA as React SPA
    participant API as Express REST API
    participant DB as PostgreSQL

    User->>SPA: Mở trang đăng nhập
    SPA->>API: GET /api/auth/csrf
    API-->>SPA: csrfToken trong JSON + CSRF cookie HttpOnly
    User->>SPA: Nhập email/mật khẩu, hoàn tất reCAPTCHA
    SPA->>API: POST /api/auth/login + captchaToken + X-CSRF-Token
    API->>API: Kiểm tra Origin, CSRF, CAPTCHA và thông tin đăng nhập
    API->>DB: Xác minh user ACTIVE/emailVerified
    API->>DB: Tạo AuthSession + lưu SHA-256(refresh token)
    API->>API: Ký access JWT HS256, hạn 15 phút
    API-->>SPA: JSON { accessToken, expiresIn, user }
    API-->>SPA: Set-Cookie refresh opaque, HttpOnly, SameSite=Lax
    SPA->>SPA: Giữ access JWT trong biến JavaScript memory

    SPA->>API: GET /api/auth/me hoặc /api/admin/... với Bearer JWT
    API->>API: Kiểm tra chữ ký, issuer, audience, exp, claims
    API->>DB: Kiểm tra AuthSession còn hiệu lực và user còn ACTIVE
    API-->>SPA: JSON data nếu hợp lệ; 401 nếu không hợp lệ

    alt Access JWT hết hạn và API trả 401
        SPA->>API: GET /api/auth/csrf
        SPA->>API: POST /api/auth/refresh + cookie + X-CSRF-Token
        API->>DB: Consume refresh token cũ, tạo token kế tiếp
        API-->>SPA: accessToken mới + CSRF token + refresh cookie đã rotate
        SPA->>API: Retry request ban đầu một lần với Bearer mới
    else Refresh không hợp lệ/hết hạn
        API-->>SPA: 401
        SPA->>SPA: Xóa JWT/cache riêng tư, chuyển sang unauthenticated
    end

    User->>SPA: Đăng xuất
    SPA->>API: POST /api/auth/logout + CSRF + refresh cookie
    API->>DB: Thu hồi AuthSession
    API-->>SPA: 204 + xóa auth cookies
    SPA->>SPA: Xóa JWT/cache; phát thông báo logout cho tab khác
~~~

## Nơi lưu token và lý do

| Dữ liệu | Nơi lưu/truyền | Lý do |
| --- | --- | --- |
| Access JWT | Biến module JavaScript trong tab đang mở; gửi qua `Authorization: Bearer ...` | Hết hạn sau 15 phút. Không tồn tại sau reload và không bị ghi vào Local Storage, Session Storage, IndexedDB, URL hoặc persisted Redux. Điều này giảm khả năng token còn sót lại trên thiết bị sau khi tab đóng. |
| Refresh token | Opaque token trong cookie HttpOnly, SameSite=Lax; Secure ở production. Database chỉ lưu SHA-256 hash. | JavaScript không thể đọc cookie refresh. Token được rotate khi refresh; token cũ được đánh dấu đã dùng. |
| CSRF token | API trả token cho SPA và đặt cookie CSRF; client gửi `X-CSRF-Token`. Backend đối chiếu token với cookie và kiểm tra trusted `Origin`. | Refresh dùng cookie tự động gửi bởi trình duyệt, nên CSRF phải được kiểm tra riêng. |
| Refresh coordination | Web Locks API; fallback lease metadata trong Local Storage khi không có Web Locks. | Tránh nhiều tab đồng thời rotate cùng cookie. Lease chỉ có owner/expiry metadata, không chứa access hay refresh token. |

JWT chứa `sub` (user ID), `sid` (AuthSession ID), `iss`, `aud`, `iat`, `exp` và `jti`. API chỉ chấp nhận `HS256`, type `at+jwt`, thời hạn chính xác 900 giây, chữ ký/issuer/audience hợp lệ. API không tin role do client gửi; user/role được lấy từ database qua session đang hoạt động.

## Trạng thái khi khởi động lại trình duyệt

1. AuthProvider bắt đầu ở trạng thái `loading`; protected UI chưa được hiển thị.
2. Client lấy CSRF token, gọi `POST /api/auth/refresh` với cookie trình duyệt và nhận access JWT mới.
3. Client gọi `GET /api/auth/me` bằng Bearer token để lấy user hiện tại.
4. Thành công thì state chuyển thành `authenticated`; không có refresh session thì chuyển thành `unauthenticated`.
5. Lỗi mạng khi restore giữ protected UI ở trạng thái loading/unavailable để người dùng retry; không biến lỗi mạng thành thông báo chắc chắn đã logout.

## Đăng ký, OTP, reset và logout

- Register và resend OTP bắt buộc reCAPTCHA; login cũng bắt buộc reCAPTCHA.
- `POST /api/auth/verify-otp` chỉ xác minh email. Response không cấp JWT, không tạo refresh cookie và UI chuyển người dùng đến login.
- Reset password không tự đăng nhập. Reset thành công thu hồi các AuthSession hiện có; user phải login lại bằng mật khẩu mới. JWT cũ bị từ chối vì `sid` đã bị revoke.
- Logout xóa JWT trong memory, private cache và auth cookies; BroadcastChannel thông báo logout/account change cho tab khác. Không phát tán token qua BroadcastChannel.
- Route guard chỉ điều khiển UI. Mọi `/api/admin/**` request vẫn phải qua backend xác thực Bearer JWT và session active.

## Kiểm thử được ghi nhận

Tại merge commit `3b9032e`, automated suite có 39/39 test pass và production build hoàn tất. Đây là kiểm thử client mocked và Express app test-double/in-memory; chưa chứng minh việc gửi email, xác minh reCAPTCHA thật hoặc migration trên database production. Xem [capture-plan.md](capture-plan.md) để thu bằng chứng UI/Network/Application/API/DB.
