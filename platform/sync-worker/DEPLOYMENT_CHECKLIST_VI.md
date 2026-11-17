# ChấmPro — kiểm thử và triển khai đồng bộ D1/R2 (16/11/2026)

## Phạm vi và tình trạng
Mã nguồn đã tích hợp vào nhánh feature/champro-sync-server-integration-20261116.
**Chưa tự triển khai lên Cloudflare hoặc web đang hoạt động. Không bật đồng bộ dữ liệu học sinh thật.**

- Worker RIÊNG: champro-sync-staging, không thay Worker thanh toán và nâng cấp gói.
- D1: champro-platform-staging, migration cộng thêm **0004_sync_records.sql**. Không dùng 0003 vì 0003 đã dành cho device_pairings.
- R2: champro-photos-staging, không công khai URL ảnh.
- WordPress: ChấmPro Sync Device Auth 0.1.0-staging, đã cài trên mrhien.com. Khi bật phải có CHAMPRO_SYNC_DEVICE_ENABLED=true và CHAMPRO_SYNC_HMAC_SECRET trùng Worker secret.
- Web: app-preview/account-bridge.mjs xác thực phiên WordPress, web-app-sync.mjs tự khởi động khi có token; giữ token trong RAM, không lưu trong localStorage.
- APK: android-build/app-sync.mjs tự đồng bộ khi khóa thiết bị đã đăng ký, sau khi có mạng và máy rảnh. APK hiện có của người dùng không được tự thay thế hay xóa.
- Dữ liệu: exams (bao gồm exam.keys chứa toàn bộ đáp án và quy tắc điểm), students, results; ảnh phiếu JPEG được lưu riêng lên R2. Tài khoản/gói sử dụng do WordPress/D1 quyền thanh toán quản lý và được xác thực riêng, không đồng bộ từ localStorage.

## Những điều phải làm trước khi bật
1. Sao lưu **D1**, toàn bộ WordPress và ảnh phiếu hiện có. Kiểm tra tệp sao lưu đọc lại được. Không xóa ứng dụng/IndexedDB/localStorage.
2. Kiểm tra tên database và bucket staging trong Cloudflare. D1 phải có bảng accounts từ dịch vụ quyền người dùng; áp dụng riêng platform/migrations/0004_sync_records.sql vào staging D1 sau sao lưu.
3. Triển khai platform/sync-worker vào Worker MỚI champro-sync-staging với CHAMPRO_SYNC_ENABLED=0 (đang tắt). Không thay thế Worker champro-platform-staging hoặc Worker thanh toán.
4. Tạo khóa ngẫu nhiên mới dài >=32 bytes. Chỉ quản lý khóa trong Cloudflare Worker Secret `CHAMPRO_SYNC_HMAC_SECRET` và wp-config.php cùng tên; không gửi qua chat hay commit lên GitHub. Giữ khóa có phiên bản và kế hoạch xoay khóa.
5. Bảo đảm WordPress Sync Device Auth có cờ CHAMPRO_SYNC_DEVICE_ENABLED=false cho tới khi đủ điều kiện bật. Kiểm tra endpoint web-token và device challenge từ tài khoản thử, không được trả token khi cờ tắt.
6. Kiểm thử trên **hai tài khoản giả lập khác nhau**: user A tuyệt đối không đọc/tải ảnh của user B. Token hết hạn/giả chữ ký/bị phát lại phải bị từ chối.
7. Kiểm thử **hai thiết bị một tài khoản**: tạo kỳ kiểm tra/đáp án/danh sách học sinh, chấm offline trên APK, về mạng upload điểm và JPEG, web đọc lại; web sửa đáp án, điện thoại tải về khi không chấm.
8. Kiểm thử đổi cùng bản ghi trên hai máy: phải hiện xung đột, không ghi đè hoặc mất dữ liệu. Kiểm thử đổi tài khoản và xóa cục bộ có kiểm soát.
9. Kiểm thử tốc độ camera/OMR thực tế trên điện thoại, rút mạng và chạy liên tục; không chạy sync trong vòng lặp camera.
10. Chỉ sau khi QA đạt và được xác nhận quyền dữ liệu mới chuyển CHAMPRO_SYNC_ENABLED=1 và CHAMPRO_SYNC_DEVICE_ENABLED=true cho staging/nhóm thử. Không tự mở đồng bộ mọi tài khoản.

## Kiểm tra tự động
Xem workflow `.github/workflows/champro-sync-server-integration-qa.yml`:
- Tách tài khoản, chống đọc dữ liệu chéo và sửa không có quyền
- So sánh revision D1, giữ lại cả hai bản khi xung đột
- Tải/đọc ảnh R2 với metadata marker và checksum SHA256
- Máy A offline rồi lên mạng, máy B đọc dữ liệu
- Giao diện web phải có phiên WordPress và camera rảnh để đồng bộ
- Chỉ sửa phần sync, không sửa grader/OMR

## Không nên làm
- Không cấp token sync bằng JWT license offline hoặc gói WooCommerce.
- Không upload ảnh/điểm thật khi chưa có chấp thuận của chủ tài khoản.
- Không xóa/ghi đè phiếu, chấm bài hay LocalStorage trong khi nâng cấp.
- Không xem thử nghiệm GitHub CI là xác nhận đã chạy thật trên Cloudflare.
- Không thể cam kết tự cập nhật APK v14.7.4 đang cài vì gói QA dùng chữ ký debug/mã gói khác. Phải kiểm tra chữ ký bản chính thức trước khi cài đè.
