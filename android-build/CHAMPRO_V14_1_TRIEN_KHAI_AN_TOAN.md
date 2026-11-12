# CHẤMPRO TEST v14.1 – ĐĂNG NHẬP / THANH TOÁN QR / CHẤM OFFLINE

**Mức triển khai: mã nguồn và APK thử nghiệm. KHÔNG phải đã kích hoạt trên mrhien.com.**
Không tự động triển khai WordPress, Cloudflare, GitHub Pages hay ghi đè ChấmPro v13/v14.

## Những gì đã lập trình
- APK riêng `com.champro.nativepreview.v14auto`, giao diện đăng ký/đăng nhập và chọn 2 gói. Không hiển thị giấy phép phải nhập thủ công.
- Kết nối tài khoản WordPress qua mã 9 ký tự, thời hạn 10 phút. WordPress phê duyệt trên máy chủ, trình duyệt/app chỉ cầm mã ghép nối một lần, không cầm bí mật ký.
- Worker lưu SHA-256 của mật mã polling và refresh trong D1; tài khoản được bind với thiết bị.
- Phiên đăng nhập liên kết tài khoản xong, API cấp giấy phép ES256 cho thiết bị. APK chỉ giữ giấy phép đã xác thực chữ ký và quyền cập nhật, chấm offline.
- Gia hạn/nâng cấp: WooCommerce tạo đơn server-side bằng sản phẩm ChấmPro. Người dùng xem QR theo đơn và chuyển khoản qua SePay ở trang thanh toán WooCommerce. Sau khi giao dịch xác nhận, bridge cấp quyền D1; ứng dụng tự kiểm tra khi quay lại hoặc trong mục Tài khoản. Nếu mất mạng chỉ nhận quyền khi kết nối lại.
- Thuật toán camera, OMR, nhận diện, tính điểm, thư viện QR/Excel và lưu ảnh được sao chép NGUYÊN VẸN từ v13; CI kiểm tra `cmp` cho lõi chấm.

## Những yêu cầu bắt buộc trước khi bán/cấp cho khách

1. Sao lưu dữ liệu chấm trên điện thoại hiện dùng v13. Không gỡ app v13. v14.1 cài với package riêng: dữ liệu không tự chuyển qua.
2. Vào tài khoản Cloudflare đang giữ D1 staging, KHÔNG triển khai lên Production:
   - D1: `npx wrangler d1 migrations apply champro-platform-staging --remote --config wrangler.jsonc` trong `platform/worker`. Bản mới tạo bảng `device_pairings`, `device_grants`.
   - Trước khi deploy Worker v14.1 cần cấu hình đúng `AUTH_HMAC_SECRET`, `INTERNAL_BRIDGE_SECRET` và `LICENSE_PRIVATE_JWK`. Giá trị khóa bí mật chỉ giữ trong Cloudflare Secrets, KHÔNG ghi vào GitHub/tệp APK/chat.
   - `LICENSE_PRIVATE_JWK` phải là khóa P-256 khớp khóa công khai của `android-build/offline-license.mjs`. KHÔNG tự tạo khóa khác nếu chưa thay khóa công khai APK.
   - Đối chiếu `PRODUCT_ANNUAL_ID`, `PRODUCT_LIFETIME_ID`, `ADMIN_WP_USER_IDS`, `ALLOWED_ORIGINS`; chuỗi CORS phải có `https://localhost` cho Capacitor APK.
3. WordPress trên mrhien.com:
   - Kiểm tra plugin WooCommerce, SePay Payment Gateway đã nhận webhook và thử giao dịch nhỏ (xác nhận đúng mã đơn, tiền và trạng thái paid). Không sử dụng QR tĩnh.
   - Đảm bảo các hằng số `CHAMPRO_WORKER_URL`, `CHAMPRO_AUTH_SECRET`, `CHAMPRO_BRIDGE_SECRET`, `CHAMPRO_ANNUAL_PRODUCT_ID`, `CHAMPRO_LIFETIME_PRODUCT_ID` trong `wp-config.php` khớp Cloudflare.
   - Cài/kiểm tra plugin `champro-bridge.php` rồi plugin `champro-app-account.php`. Plugin v14.1 chỉ tự động ghi nhận thanh toán khi `CHAMPRO_SEPAY_GATEWAY_ID` đúng **ID cổng thanh toán đã thực sự cấu hình trên site**; không tự đoán ID.
   - Tạo trang WordPress slug `champro-connect-app`, nội dung duy nhất `[champro_app_connect]`; đăng nhập mrhien.com từ đó.
   - Hai sản phẩm WooCommerce phải là **99.000đ / 1 năm** và **299.000đ / trọn đời**, tiền VND, ID lấy từ cấu hình hiện có. Cần chủ website xác nhận lại giá trước khi mở bán. Mismatch thì plugin từ chối tạo đơn.
4. Kiểm thử end-to-end với tài khoản và đơn hàng thử:
   - Nhận mã kết nối app (10 phút); mở WP; đăng nhập; xác nhận mã; app tự nhận giấy phép mà không nhập thủ công.
   - Mua gói: WooCommerce phải hiển thị QR theo đơn qua SePay. Không thể nhận gói khi chỉ nhấn “Đã chuyển khoản”, khi thanh toán thiếu, hoặc khi khách đổi số tiền/đơn.
   - Khi WooCommerce xác nhận đơn, D1 đổi plan, APK tự cập nhật giấy phép khi có Internet và khi mở lại app; thử gửi webhook lặp không cấp 2 lần.
   - Tắt Internet, mở camera và chấm ít nhất 20 phiếu thật, đối chiếu từng kết quả và số giây/phiếu với v13. Thử camera dọc, xoay, phần II/III, chấm lại, sửa đáp án, lưu ảnh, xuất Excel, QR, ứng dụng đóng/mở offline.
   - Thử mất mạng lúc thanh toán, cấp lại lượt sau khi nối mạng, hết trial/annual, hoàn tiền và thu hồi gói. Vì offline, không thể thu hồi ngay khi máy đã ngắt mạng.
5. Khi xác minh xong mới phát hành APK ký production. File GitHub Actions là **APK debug**, chưa phải gói Play Store. Nếu đưa lên Google Play, phải đối chiếu chính sách phương thức thanh toán áp dụng cho hàng hóa/tính năng số.

## Giới hạn cần lưu ý
- SePay QR hiện hiển thị qua trang thanh toán WooCommerce được mở từ ứng dụng; mã nguồn chưa đọc QR ngân hàng về để nhúng hiển thị trực tiếp trên màn hình native APK. Cần kiểm tra phiên bản SePay và API site trước khi làm điều đó.
- Gói Free hiện giữ **quy tắc dùng thử 7 ngày ở Worker staging**, đây chưa phải chính sách thương mại đã được chủ website xác nhận cuối cùng.
- Kích hoạt lần đầu / mua gói / nhận quyền mới cần Internet; chấm bài trên máy offline không gọi mạng.
- Không có tự động đồng bộ đề, danh sách học sinh, điểm, ảnh giữa v13 và v14.1.
- Bản quyền offline có thể bị sửa APK trên máy đã root; chữ ký số không phải bảo vệ tuyệt đối.
- Bản v13 và nhánh chính của website không bị thay đổi khi làm v14.1.
