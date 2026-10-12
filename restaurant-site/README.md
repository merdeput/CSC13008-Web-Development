# Bếp Hội — website nhà hàng Việt

Website nhà hàng dựng HTML phía máy chủ bằng Express + EJS, truy vấn PostgreSQL qua Prisma ORM 7 và Supabase. Giao diện mẫu dùng nội dung tiếng Việt, món ăn theo mùa và thương hiệu hư cấu Bếp Hội.

## Yêu cầu

- Node.js 20.19 trở lên (đã kiểm tra với Node.js 24 trong môi trường phát triển).
- Một dự án Supabase PostgreSQL và database password.
- Hai kết nối PostgreSQL từ Supabase: session pooler cho ứng dụng Express đang chạy lâu dài; direct connection cho Prisma CLI và migrations. Nếu môi trường không hỗ trợ IPv6, Supabase có thể yêu cầu session pooler cho cả ứng dụng và migrations.

## Cài đặt và cấu hình Supabase

```powershell
cd restaurant-site
npm.cmd install
Copy-Item .env.example .env
```

Mở `restaurant-site/.env` và thay các giá trị giữ chỗ:

- `DATABASE_URL`: session pooler connection string từ Supabase Dashboard → **Connect** → **Session pooler**. Dùng cổng `5432` và giữ `sslmode=require`.
- `DIRECT_URL`: direct database connection string từ **Connect**. Nếu dự án không hỗ trợ direct IPv6, dùng session pooler connection string.
- `SESSION_SECRET`: chuỗi ngẫu nhiên dài, riêng cho môi trường này. Không commit `.env`.
- `DATABASE_SSL_CA_FILE` (tùy chọn): đường dẫn đến chứng chỉ CA PostgreSQL tải từ Supabase để xác minh máy chủ. Nếu bỏ trống, kết nối vẫn mã hóa TLS nhưng không xác minh chứng chỉ pooler.

Prisma CLI đọc `DIRECT_URL` (hoặc dùng `DATABASE_URL` nếu chưa khai báo). Runtime Express đọc `DATABASE_URL`. Mọi kết nối chạy ở máy chủ; không đưa chuỗi kết nối hay mật khẩu vào HTML hoặc trình duyệt.

## Database và dữ liệu mẫu

Đối với một Supabase database mới, áp dụng migration đã commit rồi seed:

```powershell
npm.cmd run db:validate
npm.cmd run db:deploy
npm.cmd run db:seed
```

Khi sửa `schema.prisma` trong lúc phát triển, tạo migration mới bằng `npm.cmd run db:migrate -- --name <ten_migration>` rồi commit file migration.

Seed mặc định dùng `seed-phocafe-new.mjs` để nhập snapshot gồm 19 món và 4 danh mục. Giá VND là giá minh họa, không phải giá của Pho Cafe. Món mới ở trạng thái chưa công khai; các món đã có giữ nguyên trạng thái và thuộc tính, seed chỉ bổ sung URL ảnh khi trường ảnh đang trống. 18 món có poster từ menu nguồn; một món không có poster. Seed không xóa dữ liệu. Seed Bếp Hội được giữ tại `prisma/seed-bephoi.js` và có thể chạy riêng bằng `npm.cmd run db:seed:bep-hoi`.

Nếu database đã có schema hoặc dữ liệu, **không chạy reset**. Kiểm tra migration history/schema hiện tại và lập kế hoạch baseline trước khi áp dụng migration này. `npm.cmd run db:deploy` áp dụng migrations đã commit cho môi trường triển khai; không dùng `migrate dev` ở production.

Trên Windows, nếu Prisma CLI báo `P1011` khi bắt tay TLS với Supabase Session pooler, dùng `npm.cmd run db:deploy:tls`. Lệnh dự phòng chạy các file `migration.sql` đã commit qua kết nối PostgreSQL TLS, khóa triển khai đồng thời và ghi checksum vào `_prisma_migrations`; lệnh từ chối database có bảng hiện hữu nhưng chưa được baseline. Chỉ dùng với migration PostgreSQL có thể chạy trong transaction.

Migration tạo đúng sáu model: `Category`, `Dish`, `Ingredient`, `DishIngredient`, `Chef`, `Reservation`. Giá dùng `DECIMAL(12,0)`, thời điểm dùng `TIMESTAMPTZ`, bảng reservation có index thời gian và `(status, startsAt)`, cùng check constraint cho giá, số khách và thứ tự không âm. Xóa `Dish` xóa các liên kết `DishIngredient`; danh mục và nguyên liệu đang được tham chiếu thì không thể xóa.

Ứng dụng kết nối trực tiếp PostgreSQL qua Prisma, không gọi Supabase Data API. Không cần bật public table grants cho trang web.

## Chạy ứng dụng

```powershell
npm.cmd run dev
```

Mở `http://localhost:3000`. Dùng `npm.cmd start` để chạy tiến trình production sau khi đã cấu hình biến môi trường và áp dụng migrations.

`/admin` mở trực tiếp theo yêu cầu, không có đăng nhập hay phân quyền. Hãy triển khai trong môi trường mạng phù hợp với quyết định này. Biểu mẫu mutation có CSRF token; trang đặt bàn có giới hạn gửi 5 yêu cầu mỗi 15 phút cho mỗi IP. Đặt reverse proxy bằng `TRUST_PROXY=true` nếu triển khai sau proxy TLS.

## Cấu hình mặc định

- Múi giờ biểu mẫu và hiển thị: `Asia/Ho_Chi_Minh`.
- Giờ nhận yêu cầu: `11:00` đến trước `22:00`.
- Số khách tối đa của một yêu cầu: `12`.

Đây là giá trị mặc định có thể đổi bằng `RESTAURANT_TIME_ZONE`, `RESTAURANT_OPENING_TIME`, `RESTAURANT_CLOSING_TIME`, `RESTAURANT_MAX_PARTY_SIZE`. Chúng không phải thông tin đã xác minh của một nhà hàng thực tế. Website chỉ lưu yêu cầu; nhà hàng cần liên hệ để xác nhận. Không có phân bổ bàn, kiểm tra sức chứa, ngăn đặt trùng giờ hay bảo đảm chỗ ngồi.

## Kiểm tra

```powershell
npm.cmd test
```

`npm.cmd test` bao phủ validation, thời gian Việt Nam, trạng thái, CSRF/method override, luồng SSR và cập nhật nguyên liệu nguyên tử. Khi `DATABASE_URL` được cấu hình, bộ test còn chạy kiểm tra PostgreSQL thật cho SSR, CRUD, visibility, method override và reservation; các bản ghi thử sẽ được xóa sau lượt chạy. Nếu không có kết nối database, phần integration sẽ được bỏ qua.

Khi cấu hình database, kiểm tra các trang khách (`/`, `/menu`, `/dishes/:slug`, `/chefs`, `/reservations/new`) và các trang quản trị ở `/admin` trên màn hình desktop và mobile; kiểm tra một yêu cầu đặt bàn, xác nhận trong admin, chuyển trạng thái theo quy trình, cập nhật/xóa món và hồ sơ đầu bếp.
