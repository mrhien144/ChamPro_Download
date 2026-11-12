# ChấmPro Test v14 – hướng dẫn triển khai giấy phép offline (CHƯA PRODUCTION)

## Đã lập trình trên nhánh v14
- APK v14 dùng package \`com.champro.nativepreview.v14\`; cài song song v13. **Không tự chuyển dữ liệu/ảnh** từ v13.
- Code chấm ảnh, camera, đáp án, ảnh phiếu, lưu local vẫn lấy nguyên từ nhánh v13.
- Màn hình kích hoạt (APK-only) bị khóa trước khi có giấy phép ES256 đúng chữ ký, thiết bị và hạn dùng.
- Không có request mạng trong kiểm tra giấy phép, camera, vòng lặp quét hoặc chấm phiếu.
- Worker ký giấy phép cho tài khoản WordPress được xác minh; giấy phép dùng thử 7 ngày từ ngày tài khoản ChấmPro được tạo trong D1, gói năm theo hạn dùng, gói trọn đời.
- Trang WordPress tạo mã kích hoạt từ thiết bị, không nhúng mật khẩu hoặc khóa bí mật vào APK.

## CHƯA TRIỂN KHAI – cần làm trên tài khoản của chủ website
1. Sao lưu WordPress, Cloudflare D1, điện thoại chứa dữ liệu. Giữ APK v13.
2. Sao lưu cấu hình Worker staging hiện có. **Chỉ triển khai branch v14 khi đã kiểm thử và chọn thời điểm phù hợp.**
3. Trong Worker staging, thêm secret \`LICENSE_PRIVATE_JWK\` là JSON JWK P-256 **riêng tư** (KHÔNG đưa lên GitHub, mã nguồn, log hoặc ảnh chụp). Khóa bí mật phải khớp khóa công khai đã nhúng trong \`android-build/offline-license.mjs\`.
4. Bảo đảm \`AUTH_HMAC_SECRET\`, \`INTERNAL_BRIDGE_SECRET\`, liên kết D1, WooCommerce product IDs đều đang được cấu hình đúng. Worker v14 cần triển khai phiên bản có \`src/offline-license.js\` và route \`offline-license\` tại \`/api/internal\`.
5. Cài plugin ChấmPro Bridge hiện hành nếu đã được kiểm thử; đặt \`CHAMPRO_WORKER_URL\` và các hằng số yêu cầu trong wp-config.php; kiểm tra callback mua gói bằng đơn hàng sandbox.
6. Cài riêng plugin \`platform/wordpress/champro-offline-activation.php\`.
7. Tạo trang WordPress có slug \`champro-activate\`, nội dung shortcode \`[champro_offline_activate]\`, xuất bản. Người đăng nhập mới được nhận giấy phép.
8. Người dùng mở APK v14, sao chép mã thiết bị, truy cập mrhien.com/champro-activate/, dán mã, nhận giấy phép, dán vào APK và kích hoạt một lần.
9. Tắt Wi-Fi và dữ liệu di động: tắt/mở ứng dụng, tạo đề và đáp án, chấm 10 phiếu thực tế liên tục, xem ảnh, xuất kết quả; đối chiếu với v13. Đo thời gian chấm từng phiếu thực tế trên **cùng điện thoại**.
10. Kiểm tra chống cấp lại trial khi gỡ/cài app, hết hạn theo đồng hồ, đổi thiết bị, gói trả phí, tài khoản bị khóa, lưu/khôi phục dữ liệu.
11. APK GitHub Actions chỉ là **debug APK thử nghiệm**, chưa ký bằng khóa phát hành, chưa sẵn sàng đưa CH Play.

## Giới hạn cần hiểu
- Không thể xác minh thu hồi giấy phép tức thì khi thiết bị luôn offline; việc thu hồi cần cho thiết bị kết nối lại hoặc giấy phép được thiết kế theo hạn ngắn.
- Phần mềm xử lý hoàn toàn trên thiết bị có thể bị kỹ thuật đảo ngược APK tìm cách bỏ giao diện khóa. Chữ ký ES256 ngăn giả mạo mã giấy phép, không chống được mọi kiểu bẻ khóa bản APK.
- Không hứa không giảm tốc độ nếu chưa so sánh bằng phiếu thật; bản quyền không nằm trên đường xử lý chấm nên về thiết kế không tạo độ trễ mạng.
- Chưa đồng bộ ảnh phiếu và dữ liệu v13 sang v14. Bản sao lưu JSON hiện không chứa ảnh phiếu.
- Không công khai mã thử nghiệm v14 như bản thương mại khi chưa kiểm thử backend WordPress/Worker và thiết bị thực tế.
