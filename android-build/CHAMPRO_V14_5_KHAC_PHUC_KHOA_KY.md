# ChấmPro Test v14.5 – khắc phục lỗi khóa ký giấy phép

**Bản staging. Không merge production, không xóa ChấmPro v13.**

## Nguyên nhân đã được xác định
Trang `/champro-login-app/` hoạt động nhưng plugin v14.4 chỉ phát giấy phép khi có hằng số `CHAMPRO_LICENSE_PRIVATE_JWK`. Nếu hằng số chưa cấu hình, trang dừng với thông báo “ChấmPro chưa hoàn tất cấu hình máy chủ xác thực”. Đồng thời APK v14.4 nhúng khóa công khai thử nghiệm cố định, không đảm bảo khớp WordPress.

## Thay đổi v14.5
- Plugin ChấmPro Direct Login v0.5.1 tự khởi tạo một cặp khóa EC prime256v1 trong `admin_init` **khi quản trị viên mở wp-admin**, nếu chưa có khóa được cung cấp trong wp-config.php.
- Chỉ giữ khóa **riêng** trong tùy chọn WordPress `cpd_offline_es256_key_v1`, không autoload. Sao lưu WordPress phải bao gồm option này. Bảo vệ quyền đọc DB và backup cẩn thận. Không đưa khóa riêng vào GitHub, APK hoặc API công khai.
- API GET `/wp-json/champro/v2/public-key` chỉ công khai khóa xác minh `{kty,crv,x,y}`.
- APK v14.5 `com.champro.nativepreview.v145` nhận khóa công khai qua HTTPS và **ghim khóa ngay lần đầu**. Nếu sau này khóa máy chủ khác, app thông báo cần hỗ trợ thay vì tự tin tưởng khóa mới. Giấy phép ký số được xác minh offline trên điện thoại.
- Chỉ Internet lúc đăng nhập/nhận giấy phép. Camera và OMR/điểm/ảnh/trích xuất không gọi mạng mỗi phiếu.
- Android deep link thử nghiệm riêng `champrotest145://auth/complete` không tranh với v14.4.

## Cần thực hiện trên mrhien.com
1. Sao lưu WordPress gồm `wp_options` và plugin hiện có.
2. Tại `https://mrhien.com/wp-admin/plugin-install.php?tab=upload`, tải plugin `ChamPro_Direct_Login_v14_5_STAGING.zip` và chọn thay thế nếu WordPress hỏi. **Không cài chồng hai plugin cùng chức năng**.
3. Sau khi kích hoạt/thay thế, quản trị viên vào `https://mrhien.com/wp-admin/` một lần để sinh khóa. Nếu đã khai báo `CHAMPRO_LICENSE_PRIVATE_JWK` từ trước, plugin dùng khóa đó (cần đúng định dạng).
4. Mở `https://mrhien.com/wp-json/champro/v2/public-key`. Kết quả hợp lệ phải có `"ok":true` và `"publicKey"`; tuyệt đối không thấy `"d"`, `PRIVATE KEY` hoặc khóa bí mật.
5. Cài ChấmPro Test v14.5 APK **song song**, không gỡ v13. Bấm Đăng nhập, nếu trước đó đã đăng nhập WordPress thì hệ thống tự đưa về app; lần đầu cần đăng nhập tài khoản.
6. Đóng ứng dụng, tắt Wi-Fi/4G, mở lại, thử camera với ít nhất 20 phiếu cùng bộ phiếu v13 và đối chiếu điểm, thời gian, lưu ảnh, xuất Excel.
7. **Không phát hành công khai** nếu chưa thử trọn luồng, chưa quyết định giá/gói và chưa chốt chữ ký Android release.

## Giới hạn của bản staging
- Giấy phép dùng thử vẫn tạm mặc định 7 ngày. Quy định thương mại cần chủ website phê duyệt.
- Quyền mua gói WooCommerce/SePay chưa được đồng bộ sang user-meta `cpd_verified_plan`; vì vậy không tuyên bố tự nâng gói đã hoạt động.
- Việc đổi/khôi phục DB WordPress thiếu option chứa khóa riêng làm mất khả năng ký giấy phép mới; phải sao lưu khóa cùng site.
- Chưa có cơ chế xoay khóa/thu hồi quyền trên thiết bị vĩnh viễn offline và chưa có cơ chế phục hồi dữ liệu giữa các gói Android thử nghiệm.
