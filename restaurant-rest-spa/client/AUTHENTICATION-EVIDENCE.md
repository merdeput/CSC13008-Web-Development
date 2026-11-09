# Hướng dẫn minh chứng xác thực SPA

Tài liệu này chỉ áp dụng cho restaurant-rest-spa. Chạy trên database và cấu hình thử nghiệm riêng sau khi đã xem xét, áp migration JWT và cấu hình reCAPTCHA/email. Không dùng request ghi dữ liệu lên database dùng chung. Mỗi lần chụp, che access JWT, refresh cookie, OTP, reset token, email và mọi secret.

## Bộ ảnh cần có cho từng kịch bản

Mỗi dòng bên dưới cần một bộ gồm: **giao diện**, **Network**, **Application**, **request gọi trực tiếp** và **bản ghi database liên quan**. Nếu một mục không áp dụng, ghi rõ “không có bản ghi” hoặc “không có token trong storage” thay vì bỏ ảnh.

| Kịch bản | Giao diện và Network | Request trực tiếp / kết quả | Application và database |
| --- | --- | --- | --- |
| Chưa đăng nhập, POST, PATCH, DELETE quản trị | Đăng xuất, mở /admin, chụp redirect /login; Network ghi request quản trị nếu gửi được. | Gọi các lệnh chưa xác thực ở phần dưới; mỗi phương thức trả 401 UNAUTHENTICATED. | Application không có JWT trong Local/Session Storage hay IndexedDB. Không có bản ghi thay đổi. |
| Gọi API bỏ qua giao diện | Chụp Network của thao tác qua UI; sau đó gọi cùng path trực tiếp bằng cURL với bearer hợp lệ và không hợp lệ. | Token hợp lệ cho cùng dữ liệu/kết quả; thiếu hoặc token giả nhận 401. | Không có role hay JWT cần chỉnh trong storage. |
| JWT bị sửa hoặc hết hạn | Network cho thấy /api/admin/** mang Authorization: Bearer …; che giá trị trước khi lưu ảnh. | Sửa payload nhưng giữ chữ ký, hoặc dùng token quá 15 phút, rồi gọi API trực tiếp: 401. | JWT chỉ có trong memory; không có bản ghi bị thay đổi. |
| Đổi role ở Local Storage hoặc JWT payload | Mở tab Application và chụp Storage trước/sau khi thêm role=admin; tải lại giao diện. | Thay payload JWT nhưng giữ chữ ký rồi gọi /api/admin/dashboard: 401; server không đọc role từ localStorage. | Local Storage không có JWT. Role thật nằm ở cột User.role; audit hiện cho phép cả viewer và admin dùng admin UI, nên sửa role giả không làm thay đổi quyền thật. |
| Preflight có Authorization | Network lọc OPTIONS; chụp Origin, request headers và response headers. | Dùng lệnh preflight bên dưới: 204, Access-Control-Allow-Origin đúng origin cụ thể, có Authorization trong allowed headers và credentials được bật. | Không tạo hoặc đổi bản ghi. |
| GET /api/dishes tìm kiếm/phân trang, không token | Mở trang thực đơn với truy vấn và chụp danh sách cùng Network. | Gọi /api/dishes và /api/menu với cùng query; cả hai trả cùng items, total, page, pageSize, không cần bearer. | Không có JWT trong Storage; không đổi database. |
| Đăng ký gửi role: admin | Đăng ký qua UI hoặc gửi request hợp lệ; chụp response generic, không có accessToken. | Gửi body có role: admin cùng CAPTCHA hợp lệ; đăng nhập sau khi xác minh vẫn trả user.role: viewer. | User.role = viewer, User.status = PENDING; OTP lưu dạng hash. |
| Thiếu/sai CAPTCHA khi đăng ký | Gửi form thiếu CAPTCHA hoặc để widget trả lỗi; chụp Network. | Request thiếu/sai token trả 400 CAPTCHA_REQUIRED; không có accessToken. | Không có user/challenge mới và không phát sinh email OTP cho request đó. |
| OTP sai, hết hạn, đã dùng | Màn xác minh email hiển thị lỗi; Network chụp INVALID_OTP. | OTP sai/hết hạn/replay đều 400 INVALID_OTP. Mỗi 5 lần sai liên tiếp khóa 15 phút; resend sau cooldown đổi mã nhưng không reset attempts. | OTP sai/hết hạn: trạng thái vẫn PENDING; attempts tăng với mã sai, usedAt vẫn null. OTP đã dùng sau khi xác minh thành công giữ nguyên trạng thái hiện tại (ACTIVE) khi replay. |
| Tài khoản pending đăng nhập | Gửi email/mật khẩu pending qua form login với CAPTCHA; chụp lỗi. | 401 ACCOUNT_PENDING; response không có accessToken, không đặt refresh cookie. | User vẫn PENDING, không có RefreshToken mới. |
| Đăng nhập sai đến ngưỡng rồi bỏ CAPTCHA | Thực hiện 10 lần đăng nhập sai với CAPTCHA hợp lệ trên IP thử nghiệm; sau đó bỏ CAPTCHA. | Khi đạt ngưỡng, request thiếu CAPTCHA trả 400 CAPTCHA_REQUIRED và không token; gửi CAPTCHA hợp lệ tiếp theo trả 429 RATE_LIMITED. | Không có access/refresh token; counter giới hạn lưu hash của email/IP, không lưu email/IP thô. |
| Forgot với email có và không có tài khoản | Gửi hai form với một email active và một email không tồn tại; chụp hai response. | Cùng HTTP 200, cùng nội dung generic. | Chỉ email active có PasswordReset mới; token thô chỉ nằm trong email thử nghiệm, database chỉ lưu tokenHash. |
| Vượt giới hạn forgot | Gửi 5 yêu cầu trong giới hạn thử nghiệm rồi gửi thêm một yêu cầu. | Yêu cầu vượt giới hạn trả 429 RATE_LIMITED. | Không có JWT; các reset token cũ không được hiển thị trong ảnh. |
| Mở /reset nhưng chưa gửi form | Mở link thử nghiệm, chụp form và Network. | Không có POST /api/auth/reset-password trước khi bấm gửi. | PasswordReset.usedAt vẫn null. |
| Reset token cũ/hết hạn/đã dùng | Gửi form bằng từng token đã chuẩn bị; chụp lỗi và Network. | Mỗi token trả 400 INVALID_RESET_TOKEN; không có JWT. | Password hash và authVersion không đổi; token cũ có usedAt hoặc expiresAt phù hợp. |
| Reset thành công, JWT cũ | Gửi reset hợp lệ rồi đăng nhập lại bằng mật khẩu mới. | Reset trả 200 chỉ có message, không accessToken; đăng nhập mới thành công. Gọi trực tiếp bằng JWT cũ phải nhận 401. | Password hash đổi; reset usedAt có giá trị; authVersion tăng; các refresh token cũ có revokedAt. |

## Request trực tiếp mẫu

Trong PowerShell, đặt `$apiBase = "http://localhost:3000"` và `$clientOrigin = "http://localhost:5173"`. Các lệnh dưới đây không đăng nhập:

    curl.exe -i -X POST "$apiBase/api/admin/dishes" -H "Content-Type: application/json" --data-raw "{}"
    curl.exe -i -X PATCH "$apiBase/api/admin/dishes/00000000-0000-0000-0000-000000000001" -H "Content-Type: application/json" --data-raw "{}"
    curl.exe -i -X DELETE "$apiBase/api/admin/dishes/00000000-0000-0000-0000-000000000001"

Mỗi lệnh phải trả 401 trước khi handler kiểm tra nội dung. Preflight và menu public:

    curl.exe -i -X OPTIONS "$apiBase/api/admin/dishes" -H "Origin: $clientOrigin" -H "Access-Control-Request-Method: POST" -H "Access-Control-Request-Headers: authorization,content-type"
    curl.exe -i "$apiBase/api/dishes?q=pho&mode=basic&page=1&pageSize=5"
    curl.exe -i "$apiBase/api/menu?q=pho&mode=basic&page=1&pageSize=5"

Để kiểm tra CAPTCHA/CSRF trực tiếp, lấy cookie CSRF và header từ lần gửi hợp lệ trong DevTools Network, rồi dùng Copy as cURL và chỉ thay phần cần kiểm tra. CAPTCHA dùng một lần; không tái sử dụng token của request trước. Với reCAPTCHA sai/thiếu, chụp status/body và truy vấn xác nhận không có user mới.

Để sửa payload JWT cho phép thử chữ ký, lấy token thử nghiệm tạm thời từ response login. Không lưu token thô vào ảnh hoặc báo cáo:

    $parts = $accessToken.Split('.')
    $payload = $parts[1].Replace('-', '+').Replace('_', '/')
    $payload += '=' * ((4 - ($payload.Length % 4)) % 4)
    $claims = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($payload)) | ConvertFrom-Json
    $claims.role = 'admin'
    $json = $claims | ConvertTo-Json -Compress
    $changed = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($json)).TrimEnd('=').Replace('+', '-').Replace('/', '_')
    $tamperedToken = "$($parts[0]).$changed.$($parts[2])"
    curl.exe -i "$apiBase/api/admin/dashboard" -H "Authorization: Bearer $tamperedToken"

Kết quả phải là 401 vì payload mới không có chữ ký hợp lệ. Để chứng minh hết hạn, dùng token phát hành hơn 15 phút trước trong một request trực tiếp không kèm refresh cookie.

## Truy vấn chỉ đọc để chụp dữ liệu

Chạy trên database thử nghiệm bằng psql; chỉ chụp các cột cần thiết và che email/hash trước khi nộp:

    SELECT u."role", u."status", c."otpHash", c."expiresAt", c."attempts", c."lockedUntil", c."usedAt"
    FROM "User" u LEFT JOIN "ActivationChallenge" c ON c."userId" = u."id"
    WHERE u."email" = '<test-email>';

    SELECT u."status", u."authVersion", u."passwordHash", r."tokenHash", r."expiresAt", r."usedAt"
    FROM "User" u LEFT JOIN "PasswordReset" r ON r."userId" = u."id"
    WHERE u."email" = '<test-email>';

    SELECT "userId", "familyId", "expiresAt", "revokedAt"
    FROM "RefreshToken" WHERE "userId" = '<test-user-uuid>';

    SELECT "keyType", "keyHash", "failureCount", "windowStartedAt", "lockedUntil"
    FROM "LoginFailureCounter"
    WHERE "updatedAt" > now() - interval '1 hour';

Chrome DevTools: **Network** chụp status, JSON và request headers đã che Authorization; **Application → Cookies** chụp bephoi.refresh có cờ HttpOnly cùng bephoi.csrf; **Local Storage**, **Session Storage** và **IndexedDB** chụp không có access JWT. Không đưa cookie hoặc token thô vào ảnh.
