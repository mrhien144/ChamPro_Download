# ChấmPro Sync - triển khai thử nghiệm an toàn

**Tình trạng: chỉ dùng để kiểm thử; KHÔNG triển khai đồng bộ dữ liệu học sinh thật.**
Đây là dịch vụ đồng bộ RIÊNG, không thay thế Worker thanh toán/gói quyền đã chạy.

## Đã có
- Cloudflare Worker riêng `champro-sync-staging`, /api/sync/status, /api/sync/records, /api/sync/photo.
- D1 account-isolated records, optimistic revision/compare-and-swap; R2 ảnh JPEG kèm tọa độ phiếu.
- WordPress plugin `ChấmPro Sync Device Auth`: đăng ký public key thiết bị trong lần PKCE login đã xác nhận; nonce dùng một lần; web-session JWT được ký.
- Mỗi phiên đồng bộ tồn tại tối đa 600 giây. Ứng dụng giữ khóa private non-extractable ở thiết bị, tự gia hạn token khi có mạng.
- Bộ đồng bộ nền chỉ đọc/ghi sau khi máy chủ xác nhận chủ tài khoản, hỏi xác nhận một lần với dữ liệu cục bộ đã có; không đưa công việc mạng vào camera.

## Bước kiểm tra trước khi triển khai (chỉ dành cho staging)
1. Sao lưu dữ liệu D1 hiện có và WordPress; KHÔNG xóa app Android, dữ liệu website hoặc ảnh phiếu. JSON sao lưu cũ KHÔNG bao gồm ảnh phiếu.
2. Kiểm tra bản sao lưu và toàn bộ cấu trúc D1. Dưới D1 Console `champro-platform-staging`, chỉ chạy file `platform/migrations/0004_sync_records.sql` sau khi sao lưu. Không chạy lại các migrations 0001/0002 hoặc đụng bảng accounts/payments.
3. Cài `champro-sync-device.zip` ở WordPress như plugin mới; mặc định tắt. Đừng thay thế Bridge, Checkout Gate, Direct Login hay SePay.
4. Tạo một bí mật ngẫu nhiên mới ≥32 bytes. Lưu CHỈ trong wp-config.php qua `CHAMPRO_SYNC_HMAC_SECRET` và trong Cloudflare Secret binding cùng tên, KHÔNG đưa lên GitHub hoặc gửi trong chat.
5. Tạo Worker MỚI, tên `champro-sync-staging`, từ `worker.zip`; gắn D1 `champro-platform-staging` thành `DB`, R2 `champro-photos-staging` thành `BUCKET`. Giữ `CHAMPRO_SYNC_ENABLED=0` trước QA.
6. Dưới wp-config.php giữ `CHAMPRO_SYNC_DEVICE_ENABLED=false` trước QA. Khi kiểm thử với tài khoản test mới và dữ liệu giả, mới bật cả hai công tắc. 
7. Kiểm tra xác thực web và APK (nonce dùng một lần, token hết hạn, thiết bị A không đọc dữ liệu tài khoản B), tải kết quả và ảnh qua hai thiết bị, offline → online, xung đột chỉnh sửa và xóa. Kiểm tra ảnh có đủ marker và nội dung cùng SBD.
8. Cài APK QA CHỈ TRÊN MÁY THỬ SẠCH hoặc máy ảo. APK QA ký debug, KHÔNG cài đè APK v14.6 đang có dữ liệu; chữ ký sẽ khác.
9. Chưa mở đồng bộ thật nếu chưa có khóa ký Android ổn định, phương án sao lưu và chuyển cả ảnh phiếu, QA tốc độ camera trên máy thật, nhật ký lỗi và quyền xóa dữ liệu.

## Ràng buộc bảo mật
- Dữ liệu học sinh, phiếu và điểm là riêng tư; không dùng quyền gói hoặc giấy phép offline làm access token để truy cập server.
- D1 dùng khóa chính theo `account_id + kind + record_id` và CAS revision. Ảnh R2 lưu trong prefix `champro-sync/wp:<id>`; phải xác thực trong API, không công khai URL R2.
- Đồng bộ và nhận diện camera phải độc lập; lỗi Worker KHÔNG được làm mất dữ liệu hoặc chặn chấm offline.
- Trước khi thực sự đưa lên máy chủ bán hàng, cần đối chiếu với Worker đang triển khai vì phiên bản GitHub main có thể không giống phiên bản Worker thật. Dùng Worker sync RIÊNG chính là cách tránh ghi đè mã thanh toán.

## Chữ ký Android
Một số bản APK QA trước đây được build `assembleDebug` trên GitHub Actions. Debug signing key không được lưu trong repo. Không thể khẳng định APK mới tương thích chữ ký để cập nhật tại chỗ. Không gỡ bản cũ khi chưa sao lưu cả ảnh phiếu.
