# Báo cáo lỗi: duplicate `envDir` trong Vite config

**Loại lỗi:** build/config merge defect

**Nguồn:** merge `feature/jwt-frontend` vào `main`

**Trạng thái:** đã sửa trong merge commit `3b9032e`

## Mô tả

Khi hợp nhất cấu hình Vite, hai khai báo `envDir: '..'` bị giữ lại trong cùng một object. Vite vẫn hoàn thành build nhưng cảnh báo object có duplicate key. Đây là lỗi do merge/agent để lại, không phải lỗi xác thực runtime.

## Tái hiện trước khi sửa

Trong trạng thái merge trước khi sửa, `restaurant-rest-spa/client/vite.config.js` có dạng:

~~~js
export default defineConfig({
  envDir: '..',
  plugins: [react()],
  envDir: '..',
  server: { port: 5173, proxy: { '/api': 'http://localhost:3000' } }
});
~~~

Chạy lệnh sau từ `restaurant-rest-spa`:

~~~powershell
npm.cmd run build
~~~

Vite 6.4.4 báo:

~~~text
▲ [WARNING] Duplicate key "envDir" in object literal
vite.config.js:7:2:
  7 │   envDir: '..',
    ╵   ~~~~~~~
The original key "envDir" is here:
vite.config.js:5:2:
  5 │   envDir: '..',
    ╵   ~~~~~~~
~~~

Build khi đó vẫn exit 0. Hai giá trị tình cờ giống nhau nên output chưa đổi, nhưng duplicate config làm kết quả phụ thuộc thứ tự và có thể che một cấu hình khác biệt trong lần merge sau.

## Nguyên nhân

Nhánh frontend bổ sung `envDir: '..'` để Vite đọc cấu hình public từ root `restaurant-rest-spa`. Main đã có cùng giá trị trong cấu hình trước merge. Khi giải quyết conflict, cả hai dòng được giữ lại thay vì gộp thành một.

## Sửa chữa

Giữ đúng một khai báo `envDir: '..'` trong `client/vite.config.js`; giữ nguyên React plugin và proxy `/api`:

~~~js
export default defineConfig({
  envDir: '..',
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': 'http://localhost:3000' } }
});
~~~

Không đổi env values và không đọc/sửa `.env`. Chỉ xóa cấu hình trùng.

## Bằng chứng sau sửa

Sau khi bỏ dòng trùng, chạy lại:

~~~powershell
npm.cmd run build
~~~

Kết quả ghi nhận:

~~~text
vite v6.4.4 building for production...
✓ 50 modules transformed.
✓ built in 3.58s
~~~

Không còn cảnh báo duplicate `envDir`. Build vẫn đưa ra cảnh báo riêng về bundle JavaScript lớn hơn 500 kB; đây là advisory tối ưu bundle, không phải lỗi duplicate config.

Suite được chạy lại trên main sau merge:

~~~text
tests 39
pass 39
fail 0
~~~

## Bằng chứng nên đính kèm

- Ảnh/đoạn terminal trước sửa có cảnh báo duplicate key.
- Ảnh terminal sau sửa có `50 modules transformed`, `built in ...`, không còn cảnh báo duplicate key.
- Ảnh hoặc diff của `client/vite.config.js` chỉ còn một `envDir`.
- Kết quả `npm.cmd test`: 39 pass, 0 fail.

Đây là lỗi build/config đã sửa. Nó không chứng minh end-to-end auth với database, email hoặc reCAPTCHA thật. Riêng giới hạn kiểm thử refresh/database được ghi trong [migration.md](migration.md).
