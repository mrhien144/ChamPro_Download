# ChấmPro v14.2 Test — đăng nhập rõ ràng và cập nhật APK an toàn

## Trạng thái: BẢN THỬ NGHIỆM, chưa bật được đăng nhập/cập nhật ở production
- APK v14.2 có package riêng \`com.champro.nativepreview.v142\`. **Không gỡ v13/v14.1**. Dữ liệu các APK thử nghiệm không tự chuyển cho nhau.
- Nút "Đăng ký và đăng nhập" mở trực tiếp \`https://mrhien.com/my-account/\`. Đăng nhập website **không tự cấp quyền ChấmPro**.
- Nút "Kết nối tài khoản với ChấmPro" gọi Worker staging để tạo mã ghép nối; nếu API không hoạt động, hiện thông báo rõ, KHÔNG tự mở khóa ứng dụng.
- Phiên bản mới có "Kiểm tra cập nhật ChấmPro" trong menu Tiện ích và mục Tài khoản. App kiểm tra tối đa một lần/ngày khi có Internet, không chạy khi đang ở trang Camera chấm bài. Nút cập nhật chỉ mở liên kết APK chính thức khi người dùng đồng ý. Android vẫn yêu cầu xác nhận cài đặt.
- Không sửa các tệp nhận diện, grader, QR, camera và lưu ảnh của v13. CI so sánh bit-for-bit 3 module lõi và chạy test chấm.
- Việc chấm trên thiết bị vẫn offline SAU KHI kích hoạt quyền sử dụng. Kích hoạt và mua gói cần mạng.

## Vì sao v14.1 hiện "Failed to fetch"
Mã APK gọi \`https://champro-platform-staging.luckylove1404.workers.dev/api/device/start\` để tạo mã kết nối trước khi mở WordPress. Khi Worker chưa được triển khai hoặc không kết nối được, request thất bại. Nút v14.2 mở trực tiếp trang đăng nhập và tách bước ghép nối riêng. Điều đó chưa thay thế yêu cầu cấu hình Worker/D1.

## Điều kiện để KẾT NỐI TÀI KHOẢN thành công
1. Cloudflare staging Worker hoạt động, có route /health và /api/device/start, /api/device/poll, /api/device/refresh.
2. Áp dụng migration 0003 để có hai bảng \`device_pairings\` và \`device_grants\`, cấu hình các secrets chính xác, CORS cho \`https://localhost\`.
3. WordPress mrhien.com cài/cấu hình đúng plugins ChấmPro Bridge và App Account, có trang \`/champro-connect-app/\` với shortcode \`[champro_app_connect]\`.
4. Đảm bảo bộ khóa ký giấy phép ES256 hợp lệ và tương ứng public key APK.
5. Chỉ sau đó mới thử ghép nối và tắt mạng chấm phiếu thật. **Không chèn mã giả để bỏ qua xác thực**.

## Điều kiện để tự kiểm tra/cập nhật
1. Chốt MỘT Android \`applicationId\` CỐ ĐỊNH cho bản phát hành chính thức và KHÔNG đổi trong các lần nâng cấp tiếp theo.
2. Cấp và cất an toàn MỘT khóa ký APK release ổn định (không dùng debug signing GitHub Actions).
3. Mỗi APK mới tăng Android Gradle \`versionCode\`, và ký bằng khóa tương thích; không cần xóa/cài lại, không mất dữ liệu ứng dụng.
4. Xuất APK chính thức lên đường dẫn HTTPS đáng tin cậy. Ứng dụng chỉ chấp nhận đường dẫn \`https://champro.mrhien.com/downloads/champro/...\` hoặc \`https://github.com/mrhien144/ChamPro_Download/releases/download/...\`.
5. Quản trị web xuất tệp JSON \`https://champro.mrhien.com/updates/champro-android-preview.json\` (cho APK test, chưa có tệp online). Nội dung mẫu:
\`\`\`json
{
  "schema": 1,
  "packageId": "com.champro.nativepreview.v142",
  "versionCode": 14201,
  "versionName": "14.2.1",
  "apkUrl": "https://champro.mrhien.com/downloads/champro/CHAMPRO_REAL_RELEASE.apk",
  "sha256": "HEX_SHA256_64_CHARACTERS_FROM_REAL_APK",
  "notes": "Nội dung thay đổi ở bản cập nhật"
}
\`\`\`
**Đây chỉ là mẫu**, KHÔNG phải tệp phát hành thực và KHÔNG được copy chưa điền chính xác. Mỗi kênh cập nhật phải khớp package ID. Trước phát hành production thay URL tệp cấu hình và packageId theo app ổn định.
6. Chưa có tệp JSON và APK chính thức: chức năng kiểm tra chỉ báo chưa cấu hình, không giả mạo bản cập nhật.
7. APK tải qua trình duyệt Android được Android xác minh chữ ký/cùng package ID khi người dùng bấm cài đặt. Hiện tại nút mở nguồn tải tin cậy, chưa tự tải, chưa tự kiểm SHA256 tệp tải hoặc tự gọi trình cài đặt. Không tuyên bố là tự động cài âm thầm.
8. Kiểm thử trên cùng máy: nâng bản release ký cố định từ N lên N+1, dữ liệu đề/học sinh/điểm/ảnh còn đủ, không mất quyền camera; mở và chấm offline không bị thay đổi.

## Giới hạn
- v14.1 và v14.2 là các package riêng, không thể cập nhật đè giữa hai ứng dụng. Giữ v13 là bản ổn định cho đến khi xác nhận release.
- Staging có thể chưa được triển khai nên link WordPress sẽ mở nhưng quyền ChấmPro không tự cấp.
- Không dùng APK debug để phát hành thương mại hay Play Store.
