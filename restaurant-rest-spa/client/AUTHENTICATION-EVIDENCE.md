# Hướng dẫn làm minh chứng xác thực SPA

Áp dụng cho React SPA và REST API trong thư mục này. Chạy trên database thử nghiệm riêng, đã áp dụng migration JWT và đã cấu hình reCAPTCHA/email. Không gửi request ghi dữ liệu vào database dùng chung. Trước khi nộp ảnh, che Authorization, refresh cookie, CSRF token, OTP, reset token, email, hash và secret.

Với mỗi kịch bản, chụp giao diện, Network, Application và request trực tiếp bằng curl. Chụp thêm bản ghi database liên quan nếu kịch bản tạo hoặc thay đổi dữ liệu. Chỉ sử dụng tài khoản, email, token và dữ liệu thử nghiệm. Access JWT chỉ nằm trong JavaScript memory; refresh token nằm trong HttpOnly cookie. Local Storage, Session Storage và IndexedDB không được có access JWT.

## Kịch bản

| Kịch bản | Cách tạo và bằng chứng cần chụp | Kết quả mong đợi |
| --- | --- | --- |
| Chưa đăng nhập, POST/PATCH/DELETE quản trị | Xóa phiên UI, mở /admin; gửi POST, PATCH và DELETE đến /api/admin/dishes bằng JSON hợp lệ, không Authorization. Chụp redirect, Network, curl và không có bản ghi đổi. | Cả ba method trả HTTP 401 UNAUTHENTICATED. |
| Gọi API bỏ qua giao diện | Gửi cùng request quản trị bằng curl với token thiếu, giả và hợp lệ; che Authorization. | API quyết định giống UI; bỏ qua route guard không bỏ qua middleware. |
| JWT bị sửa hoặc hết hạn | Đăng nhập, sửa payload nhưng giữ chữ ký; sau hơn 15 phút gửi JWT thật đến /api/admin/dashboard. Chụp Network/curl, che token. | Cả hai trả 401; access JWT hết hạn sau 15 phút. |
| Sửa role trong storage hoặc payload | Thêm role=admin vào Local Storage, tải lại và thử sửa payload JWT rồi gọi dashboard. Chụp Application, Network và curl. | Storage không cấp quyền; payload sửa sai chữ ký bị 401. Server lấy role từ User trong DB. |
| CORS preflight có Authorization | Gửi OPTIONS đến /api/admin/dishes với Origin SPA, Access-Control-Request-Method: POST, Access-Control-Request-Headers: authorization,content-type. Chụp Network và response headers. | OPTIONS thành công; Access-Control-Allow-Origin là origin cụ thể, Authorization có trong allow-headers. |
| GET /api/dishes tìm kiếm/phân trang không token | Chụp giao diện thực đơn và Network; gọi /api/dishes và /api/menu với cùng q, mode, page, pageSize. | Hai API public trả cùng items, total, page, pageSize, pageCount. |
| Đặt bàn chưa đăng nhập | Gửi POST /api/reservations không bearer/cookie. Dùng dữ liệu hợp lệ trên DB thử nghiệm nếu cần chứng minh tạo được bản ghi. | Không bị 401; validation và tạo đặt bàn hoạt động công khai. |
| Đăng ký gửi role: admin | Đăng ký với CAPTCHA hợp lệ, body có role: admin; xác minh OTP rồi truy vấn User. Chụp request/response và bản ghi đã che dữ liệu. | User.role=viewer, User.status=PENDING lúc đăng ký. Register/OTP không trả accessToken và không đăng nhập tự động. |
| Đăng ký thiếu/sai CAPTCHA | Gửi email mới với captchaToken thiếu hoặc sai. Chụp Network/curl và truy vấn User, ActivationChallenge, email thử nghiệm. | HTTP 400 CAPTCHA_REQUIRED; không tạo user/challenge và không gửi OTP. |
| OTP sai, hết hạn, đã dùng | Dùng OTP sai/hết hạn; sau kích hoạt thành công thử lại OTP cũ. Chụp UI, Network và otpHash, expiresAt, attempts, usedAt. | INVALID_OTP (HTTP 400); challenge khóa trả OTP_LOCKED (429). Replay OTP đã dùng trả INVALID_OTP và giữ trạng thái hiện tại (ACTIVE). Sai OTP không kích hoạt user PENDING. |
| Tài khoản PENDING đăng nhập | Tạo user chưa xác minh, login với mật khẩu đúng và CAPTCHA hợp lệ. Chụp response, cookie và User. | HTTP 401 LOGIN_INVALID; không accessToken, refresh cookie hay đổi trạng thái PENDING. |
| Sai mật khẩu đến ngưỡng rồi bỏ CAPTCHA | Gửi 10 login sai với CAPTCHA hợp lệ trên môi trường thử nghiệm; tiếp theo bỏ captchaToken. Chụp response và LoginFailureCounter đã che keyHash. | Request thiếu CAPTCHA trả 400 CAPTCHA_REQUIRED, không accessToken. Login có CAPTCHA khi bị khóa trả 429 LOGIN_LOCKED. |
| Forgot với email có/không tài khoản | Gửi POST /api/auth/password-reset cho email active và email không tồn tại, đều có CAPTCHA. Chụp và so sánh status/body. | Cả hai HTTP 202 với cùng response generic. DB chỉ lưu tokenHash. |
| Vượt giới hạn forgot | Vượt giới hạn cho email trên DB thử nghiệm; dùng CAPTCHA và CSRF hợp lệ. Chụp response và headers. | HTTP 429 RATE_LIMITED; mặc định 5 request/giờ và 10/ngày theo email. |
| Mở trang reset chưa gửi form | Mở reset link có token trong URL fragment, chụp trước khi bấm gửi và đọc PasswordReset.usedAt. | Không có POST /api/auth/password-reset/confirm; usedAt vẫn null. |
| Token reset cũ/hết hạn/đã dùng | POST /api/auth/password-reset/confirm với token hết hạn/đã dùng và mật khẩu hợp lệ. Chụp response, passwordHash và tokenHash đã che. | HTTP 400 INVALID_RESET_TOKEN; passwordHash không đổi. |
| Reset thành công và JWT cũ | Reset, login lại bằng mật khẩu mới; gọi API bằng JWT cấp trước reset. Chụp response và AuthSession/RefreshToken. | Reset không có accessToken; login mật khẩu mới thành công; JWT cũ 401 do session bị thu hồi. AuthSession.revokedAt và PasswordReset.usedAt có giá trị. |

## Request trực tiếp mẫu

Trong PowerShell, đặt $apiBase = "http://localhost:3000" và $clientOrigin = "http://localhost:5173". Gửi JSON hợp lệ để middleware xác thực chạy trước handler.

    curl.exe -i -X POST "$apiBase/api/admin/dishes" -H "Content-Type: application/json" --data-raw "{}"
    curl.exe -i -X PATCH "$apiBase/api/admin/dishes/00000000-0000-0000-0000-000000000001" -H "Content-Type: application/json" --data-raw "{}"
    curl.exe -i -X DELETE "$apiBase/api/admin/dishes/00000000-0000-0000-0000-000000000001"
    curl.exe -i -X OPTIONS "$apiBase/api/admin/dishes" -H "Origin: $clientOrigin" -H "Access-Control-Request-Method: POST" -H "Access-Control-Request-Headers: authorization,content-type"
    curl.exe -i "$apiBase/api/dishes?q=pho&mode=basic&page=1&pageSize=5"
    curl.exe -i "$apiBase/api/menu?q=pho&mode=basic&page=1&pageSize=5"

Với POST auth, lấy cookie CSRF và token từ GET /api/auth/csrf rồi gửi Origin, Cookie, X-CSRF-Token. CAPTCHA là token dùng một lần. Dùng email riêng để tránh rate limit.

## Truy vấn database chỉ đọc

Thay <test-email> và <test-user-uuid> bằng dữ liệu DB thử nghiệm; che email và mọi hash trong ảnh.

    SELECT u."role", u."status", c."otpHash", c."expiresAt", c."attempts", c."lockedUntil", c."usedAt"
    FROM "User" u LEFT JOIN "ActivationChallenge" c ON c."userId" = u."id"
    WHERE u."email" = '<test-email>';

    SELECT u."status", u."passwordHash", r."tokenHash", r."expiresAt", r."usedAt"
    FROM "User" u LEFT JOIN "PasswordReset" r ON r."userId" = u."id"
    WHERE u."email" = '<test-email>';

    SELECT s."userId", s."expiresAt", s."revokedAt", s."revokeReason",
           r."tokenHash", r."expiresAt", r."usedAt"
    FROM "AuthSession" s LEFT JOIN "RefreshToken" r ON r."sessionId" = s."id"
    WHERE s."userId" = '<test-user-uuid>';

    SELECT "keyType", "keyHash", "failureCount", "windowStartedAt", "lockedUntil"
    FROM "LoginFailureCounter"
    WHERE "updatedAt" > now() - interval '1 hour';

Trong DevTools Application, thể hiện Cookies có HttpOnly nhưng che giá trị. Không đưa cookie, JWT, OTP, reset token, CAPTCHA token hay secret nguyên vẹn vào ảnh/báo cáo.