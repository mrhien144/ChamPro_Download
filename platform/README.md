# ChấmPro Platform — triển khai thử nghiệm, KHÔNG đụng hệ thống đang chạy

## Đã có trong GitHub

- \`platform/migrations/0001_init.sql\`: tài khoản, gói, lượt chấm/trộn/QR, đơn hàng, nhật ký quản trị.
- \`platform/worker/src/index.js\`: API xác thực tài khoản, giới hạn 100/5/5, gói 99k/năm và 299k trọn đời, bảo vệ quản trị, kích hoạt đơn WooCommerce.
- \`platform/wordpress/champro-bridge.php\`: bản plugin cầu nối; **chưa cài WordPress**.
- \`platform/admin/\`: giao diện quản trị thử nghiệm; **chưa nối API và chưa có quyền quản trị thật**.

Các trang gốc \`/app/\`, \`/tron-de/\`, \`/qr-excel.html\` chưa bị thay đổi, không khóa khách hàng hiện tại.

## Bước A — Sao lưu trước khi triển khai

Trên điện thoại đang chứa dữ liệu ChấmPro, vào **Sao lưu & dữ liệu**, tải JSON và giữ bản sao. Không xóa bộ nhớ trình duyệt.

## Bước B — Tạo Cloudflare D1 (cần chủ tài khoản thao tác)

1. Truy cập https://dash.cloudflare.com/ → **Workers & Pages** → **D1**.
2. Tạo cơ sở dữ liệu **champro-platform-staging**, giữ nguyên cơ sở dữ liệu khác.
3. Sao chép **Database ID** và thay \`REPLACE_WITH_STAGING_D1_DATABASE_ID\` trong \`platform/worker/wrangler.jsonc\`.
4. Cài và đăng nhập Wrangler trên máy của quản trị viên (theo hướng dẫn Cloudflare hiện hành).
5. Trong thư mục \`platform/worker\`, chạy lệnh áp dụng migration cho **staging**:
   \`npx wrangler d1 migrations apply champro-platform-staging --remote --config wrangler.jsonc\`.
6. Tạo hai bí mật bảo mật RIÊNG, ngẫu nhiên, tối thiểu 32 byte, và nhập bằng Wrangler secrets:
   \`npx wrangler secret put AUTH_HMAC_SECRET --config wrangler.jsonc\`
   \`npx wrangler secret put INTERNAL_BRIDGE_SECRET --config wrangler.jsonc\`
   **Không** ghi các giá trị bí mật vào GitHub, chat, ảnh chụp hoặc mã JavaScript.
7. Chưa triển khai Worker cho đến khi có tài khoản quản trị WP và hai sản phẩm WooCommerce thật, vì Worker không khởi động nếu thiếu cấu hình.

## Bước C — WordPress/WooCommerce và cấp quyền

- Tạo hai sản phẩm WooCommerce gói ChấmPro với giá **99.000đ/năm** và **299.000đ trọn đời** (VND).
- Điền ID đúng của hai sản phẩm vào **PRODUCT_ANNUAL_ID** và **PRODUCT_LIFETIME_ID** trong cấu hình Worker.
- Điền ID tài khoản WP quản trị vào **ADMIN_WP_USER_IDS**; không dùng mặc định hoặc ID suy đoán.
- Triển khai Worker staging: \`npx wrangler deploy --config wrangler.jsonc\`.
- Trong \`wp-config.php\` của WordPress đặt các hằng số, với giá trị do bạn giữ bí mật:
  \`CHAMPRO_WORKER_URL\`, \`CHAMPRO_AUTH_SECRET\`, \`CHAMPRO_BRIDGE_SECRET\`,
  \`CHAMPRO_ANNUAL_PRODUCT_ID\`, \`CHAMPRO_LIFETIME_PRODUCT_ID\`.
  Hai hằng số *_SECRET phải khớp hai Wrangler secrets; không gửi các giá trị này trong chat.
- **Chỉ sau khi kiểm thử staging thành công** mới cài \`champro-bridge.php\` làm plugin WordPress.
- Tạo trang WordPress \`/champro-connect/\`, đặt shortcode \`[champro_connect]\` để đăng nhập từ bảng quản trị.
- Thay \`REPLACE_WITH_STAGING_WORKER_URL\` trong \`platform/admin/admin.js\` bằng URL Worker staging thật.
- Kiểm thử đơn hàng **test**, cấp quyền, chống webhook gửi trùng và ghi nhật ký, trước khi mở bán.

## Quy tắc dùng thử và điểm cần kiểm thử

| Tính năng | Free | 1 năm | Trọn đời |
|---|---:|---|---|
| Chấm bài | 100 phiếu | Không giới hạn | Không giới hạn |
| Trộn đề | 5 lượt | Không giới hạn | Không giới hạn |
| Tạo QR | 5 lượt | Không giới hạn | Không giới hạn |
| Giá | 0đ | 99.000đ | 299.000đ |

Quy tắc trên hiện đã được mô tả trong API staging nhưng **chưa ràng buộc vào các công cụ web hiện tại**.

Cần phát triển tiếp trước khi thương mại: cơ chế phát sinh sự kiện khi **chấm/làm đề/QR thành công**, trả lại lượt nếu lỗi trước khi hoàn tất, khóa tài khoản khi hết hạn mức; xác thực đăng nhập ở cả ba công cụ; đồng bộ dữ liệu học sinh; giấy phép chấm Offline; chống đăng ký mới để lạm dụng 100 lượt. JavaScript trên trình duyệt không thể tự chống việc né giới hạn nếu toàn bộ xử lý vẫn diễn ra phía khách hàng.

## Yêu cầu an toàn

1. Chỉ dùng tài khoản admin đã xác minh ở máy chủ để cấp quyền, không dùng mật khẩu admin hardcode.
2. Không tự động đưa ảnh phiếu, danh sách học sinh hoặc điểm của giáo viên lên máy chủ khi chưa có luồng đồng bộ, quyền truy cập và chính sách dữ liệu.
3. Không xóa hoặc ghi đè dữ liệu localStorage cũ. Đồng bộ phải nhập dữ liệu cũ theo từng tài khoản, có bản sao lưu và xử lý xung đột.
4. Trước khi bán thương mại, kiểm thử riêng trên staging: 100 lượt chấm; 5 trộn; 5 QR; gia hạn; hoàn tiền; trùng webhook; đổi thiết bị; Offline và mạng chập chờn.
