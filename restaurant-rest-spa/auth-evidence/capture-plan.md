# Kế hoạch chụp minh chứng cho các kịch bản xác thực SPA

**Dự án:** Bếp Phố Hội An — React SPA + REST API

**Nguồn triển khai:** merge commit `3b9032e` trên `main`

**Mục tiêu:** Với mỗi kịch bản, lưu ảnh giao diện, Network, Application (Storage), request trực tiếp và bản ghi database liên quan. Không dùng database dùng chung.

## 1. Quy tắc bảo vệ dữ liệu trong ảnh

Trước khi chụp hoặc nộp:

- Che toàn bộ giá trị của `Authorization`, access JWT, refresh cookie, CSRF token, CAPTCHA token, OTP và reset token. Có thể để lại tên header/cookie, cookie flags và phần đầu/cuối đã che.
- Che email, số điện thoại, tên khách, hash đầy đủ và dữ liệu khách hàng. Với hash trong ảnh, chỉ để thấy cột có giá trị bằng cách che phần lớn chuỗi.
- Không chụp màn hình nội dung `.env`, secret, cookie jar hoặc terminal history.
- Không lưu JWT vào Local Storage, Session Storage, IndexedDB, URL hoặc Redux persistence. Client chỉ giữ access JWT trong biến JavaScript memory. Ứng dụng có thể tạm ghi khóa đồng bộ refresh vào Local Storage; khóa này không chứa token.
- Dùng profile Chrome riêng và tài khoản/email thử nghiệm. Dọn dữ liệu thử nghiệm sau khi nộp nếu chính sách database cho phép.

Mỗi kịch bản có một bộ minh chứng với các phần sau:

1. Giao diện: trang trước thao tác và trạng thái sau thao tác.
2. Network: request/response, method, URL, status, response code và headers liên quan.
3. Application: Cookies (chỉ flags, giá trị phải che), Local Storage, Session Storage và IndexedDB.
4. Request trực tiếp: cURL tương đương, không phụ thuộc route guard của React.
5. Database: chỉ chụp bản ghi/cột liên quan; nếu không có thay đổi thì chụp kết quả truy vấn rỗng hoặc không đổi.

Đặt tên file theo mẫu `S01-ui.png`, `S01-network.png`, `S01-storage.png`, `S01-direct.png`, `S01-db.png`. Có thể ghép các panel thành một ảnh nếu chữ vẫn đọc được. Giữ bản gốc riêng, đã che dữ liệu trước khi nộp.

## 2. Chuẩn bị môi trường

1. Dùng database thử nghiệm riêng, cấu hình API, client origin, email thử nghiệm và reCAPTCHA. Không chia sẻ giá trị cấu hình.
2. Kiểm tra migration bằng `npm.cmd run db:status` và đọc cảnh báo lịch sử migration trong README. Không chạy `db:deploy` trên database dùng chung hoặc production trước khi reconcile checksum lịch sử.
3. Mở API từ thư mục `restaurant-rest-spa` bằng `npm.cmd run dev:server`; mở terminal thứ hai và chạy `npm.cmd run dev:client`.
4. Mở `http://localhost:5173` trong Chrome profile mới. Bật Preserve log trong Network, tắt cache khi DevTools đang mở.
5. Chụp ảnh Application ban đầu: không có access JWT ở Local Storage, Session Storage hoặc IndexedDB. Chụp cookie names/flags nhưng che cookie values.
6. Tạo email/tài khoản riêng cho từng luồng. Tránh tái sử dụng cùng email khi kiểm tra rate limit.
7. Mỗi request hợp lệ cần CAPTCHA token mới. Token reCAPTCHA dùng một lần và hết hạn; không replay token đã dùng. Với request trực tiếp, lấy token mới từ widget rồi gửi ngay, hoặc dùng Copy as cURL trên request đang được tạo và che token ngay trong ảnh.
8. Mọi POST auth mutation cần `Origin`, cookie CSRF và `X-CSRF-Token`. Lấy chúng từ `GET /api/auth/csrf` hoặc từ request hợp lệ trong Network. Không đưa giá trị thật vào báo cáo.

## 3. Request trực tiếp dùng chung

Mở PowerShell và đặt URL của môi trường thử nghiệm:

~~~powershell
$api = "http://localhost:3000"
$origin = "http://localhost:5173"
~~~

Kiểm tra ba method quản trị khi không có bearer:

~~~powershell
curl.exe -i -X POST "$api/api/admin/dishes" -H "Content-Type: application/json" --data-raw "{}"
curl.exe -i -X PATCH "$api/api/admin/dishes/00000000-0000-0000-0000-000000000001" -H "Content-Type: application/json" --data-raw "{}"
curl.exe -i -X DELETE "$api/api/admin/dishes/00000000-0000-0000-0000-000000000001"
~~~

Kiểm tra preflight và thực đơn công khai:

~~~powershell
curl.exe -i -X OPTIONS "$api/api/admin/dishes" -H "Origin: $origin" -H "Access-Control-Request-Method: POST" -H "Access-Control-Request-Headers: authorization,content-type"
curl.exe -i "$api/api/dishes?q=pho&mode=basic&page=1&pageSize=5"
curl.exe -i "$api/api/menu?q=pho&mode=basic&page=1&pageSize=5"
~~~

Khi cần gửi auth request hợp lệ trực tiếp, tạo một CAPTCHA mới và dùng Copy as cURL từ request vừa phát sinh. Giữ cookie và token trong terminal thử nghiệm; trước khi lưu ảnh, che các giá trị. Với request thiếu CAPTCHA, không cần token.

## 4. Kịch bản cần chụp

| ID | Chuẩn bị và thao tác | Kết quả cần thấy |
| --- | --- | --- |
| S01 — chưa đăng nhập, POST/PATCH/DELETE quản trị | Xóa phiên profile; mở `/admin`; gửi ba lệnh quản trị trực tiếp ở trên. Chụp redirect/guard của UI, từng status trong Network/cURL, Storage và truy vấn trước/sau. | API trả `401 UNAUTHENTICATED` cho cả ba. Không có thay đổi database. |
| S02 — gọi API bỏ qua giao diện | Dùng cURL trực tiếp cho cùng endpoint với bearer thiếu, giả và hợp lệ. Với request hợp lệ, dùng tài khoản thử nghiệm đã đăng nhập; che header. | Kết quả do API quyết định; bỏ qua React guard không vượt qua được xác thực API. |
| S03 — JWT bị sửa hoặc hết hạn | Đăng nhập tài khoản thử nghiệm. Dùng token giả bằng cách đổi payload nhưng giữ chữ ký; sau 15 phút dùng JWT thật gọi `/api/admin/dashboard` trực tiếp, không gửi refresh cookie. | Token giả/hết hạn trả `401`. Network không được lưu nguyên token. |
| S04 — sửa role trong Local Storage hoặc payload | Gọi dashboard bằng token thật; thêm `role=admin` vào Local Storage rồi gọi lại bằng cùng token. Sau đó thử đổi role trong payload JWT nhưng giữ chữ ký và gọi API. | Giá trị Local Storage không đổi quyền phía server. Payload bị sửa có chữ ký không hợp lệ và trả `401`. Quyền server đọc từ user trong DB; policy hiện tại cho `viewer` và `admin` cùng truy cập admin UI. |
| S05 — preflight Authorization | Gửi lệnh OPTIONS ở mục 3. Chụp request headers và CORS response headers trong Network/cURL. | OPTIONS thành công (thông thường `204`); `Access-Control-Allow-Origin` là origin đã cấu hình, `Authorization` nằm trong `Access-Control-Allow-Headers`. |
| S06 — GET /api/dishes tìm kiếm/phân trang, không token | Mở thực đơn, dùng `q`, `mode`, `page`, `pageSize`; gọi trực tiếp `/api/dishes` và `/api/menu` cùng query. | Không cần bearer; hai endpoint trả cùng items và metadata phân trang. |
| S07 — đăng ký gửi `role: admin` | Dùng email mới, CAPTCHA hợp lệ, gửi body có thêm `role: admin`; xác minh OTP sau đó truy vấn User. | Đăng ký không trả access token; bản ghi mới có `role=viewer`, `status=PENDING`. Xác minh OTP không tự login. |
| S08 — đăng ký thiếu/sai CAPTCHA | Dùng email mới; gửi form thiếu CAPTCHA rồi gửi một request với CAPTCHA giả. Chụp response và truy vấn User, ActivationChallenge, email thử nghiệm. | `400 CAPTCHA_REQUIRED`; không tạo user/challenge và không gửi OTP cho request bị từ chối. |
| S09 — OTP sai, hết hạn, đã dùng | Thử OTP sai trên challenge còn hạn, challenge hết hạn, rồi replay OTP đã dùng sau khi một tài khoản thử nghiệm được kích hoạt thành công. Chụp giao diện, status/code và hàng ActivationChallenge. | OTP không hợp lệ trả `400 INVALID_OTP`; challenge bị khóa có thể trả `429 OTP_LOCKED`. Replay trả `INVALID_OTP`; trạng thái hiện tại sau kích hoạt vẫn `ACTIVE`. OTP sai không kích hoạt user `PENDING`. |
| S10 — tài khoản PENDING đăng nhập | Đăng ký nhưng không xác minh; login với mật khẩu đúng và CAPTCHA hợp lệ. Chụp response, cookie và bản ghi User. | `401 LOGIN_INVALID`; không có `accessToken`, không có refresh cookie mới; tài khoản vẫn `PENDING`. |
| S11 — login sai đến ngưỡng rồi bỏ CAPTCHA | Trên môi trường thử nghiệm, gửi 10 login sai với CAPTCHA hợp lệ, sau đó gửi login không có CAPTCHA. Tiếp theo thử request có CAPTCHA hợp lệ. Chụp LoginFailureCounter đã che keyHash. | Request bỏ CAPTCHA trả `400 CAPTCHA_REQUIRED`, không có token. Request có CAPTCHA khi bị khóa trả `429 LOGIN_LOCKED`. |
| S12 — forgot với email có và không có tài khoản | Gửi `POST /api/auth/password-reset` với hai email thử nghiệm, một tồn tại và một không tồn tại; mỗi request có CAPTCHA/CSRF hợp lệ. So sánh status và JSON. | Cả hai trả `202` và cùng response generic. Database chỉ lưu `tokenHash`, không lưu reset token thô. |
| S13 — vượt giới hạn forgot | Gửi quá 5 request/giờ cho cùng email thử nghiệm; thêm CAPTCHA/CSRF hợp lệ từng request. Chụp response và rate-limit headers. | Request vượt giới hạn trả `429 RATE_LIMITED`; giới hạn theo email mặc định là 5/giờ và 10/ngày. |
| S14 — mở reset chưa gửi form | Mở reset link thử nghiệm; chụp giao diện và Network trước khi gửi form. Truy vấn PasswordReset trước/sau. | Không có `POST /api/auth/password-reset/confirm`; `usedAt` vẫn `NULL`. Token trong URL fragment được xóa khỏi thanh địa chỉ; không chụp token. |
| S15 — reset token cũ/hết hạn/đã dùng | Gửi confirm với từng loại token không còn hợp lệ và mật khẩu mới đủ policy. Chụp response và passwordHash/reset row đã che. | `400 INVALID_RESET_TOKEN`; `passwordHash` không đổi. |
| S16 — reset thành công và JWT cũ | Đăng nhập, giữ JWT cũ trong biến thử nghiệm tạm thời; reset mật khẩu; login lại bằng mật khẩu mới; gọi API bằng JWT cũ trực tiếp. Chụp response và AuthSession/PasswordReset. | Reset không trả access token; mật khẩu mới login được; JWT cũ trả `401` vì session bị revoke. `PasswordReset.usedAt` và `AuthSession.revokedAt` có giá trị. |
| S17 — đặt bàn công khai | Mở form đặt bàn khi đã logout, gửi một request thử nghiệm hợp lệ; sau đó lặp lại cURL bằng payload lấy từ Network nhưng bỏ bearer/cookie. | `/api/reservations` không trả `401` vì thiếu đăng nhập. Request hợp lệ ghi một bản ghi trên DB thử nghiệm. |

## 5. Truy vấn database chỉ đọc

Thay placeholder bằng dữ liệu thử nghiệm. Không chụp email/hash/token nguyên vẹn.

~~~sql
SELECT u."role", u."status", c."otpHash", c."expiresAt",
       c."attempts", c."lockedUntil", c."usedAt"
FROM "User" u
LEFT JOIN "ActivationChallenge" c ON c."userId" = u."id"
WHERE u."email" = '<test-email>';

SELECT u."status", u."passwordHash", r."tokenHash",
       r."expiresAt", r."usedAt"
FROM "User" u
LEFT JOIN "PasswordReset" r ON r."userId" = u."id"
WHERE u."email" = '<test-email>';

SELECT s."userId", s."expiresAt", s."revokedAt", s."revokeReason",
       r."tokenHash", r."expiresAt", r."usedAt"
FROM "AuthSession" s
LEFT JOIN "RefreshToken" r ON r."sessionId" = s."id"
WHERE s."userId" = '<test-user-uuid>';

SELECT "keyType", "keyHash", "failureCount", "windowStartedAt", "lockedUntil"
FROM "LoginFailureCounter"
WHERE "updatedAt" > now() - interval '1 hour';
~~~

## 6. Kiểm tra trước khi nộp

- Mỗi ID S01–S17 có đủ UI, Network, Application/Storage, request trực tiếp và DB nếu có bản ghi liên quan.
- Các ảnh đều dùng profile/email thử nghiệm; token/header/cookie/OTP/email/hash đã che.
- Status, JSON code và SQL row khớp với kết quả kỳ vọng.
- Không dùng ảnh test mock để khẳng định đã gọi dịch vụ email, CAPTCHA thật hoặc database production.
- Ghi rõ mọi kịch bản chưa thực hiện thay vì đánh dấu đã đạt.
