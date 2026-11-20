# ChấmPro: sửa quyền gói tặng trên máy chủ

## Trạng thái

**Bản ứng viên 0.5.4 — chưa triển khai lên mrhien.com.**

Ngày 20/11/2026 đã đọc trực tiếp plugin đang hoạt động trong trình quản trị WordPress:

| Plugin | Phiên bản | SHA-256 của bản sao lưu |
| --- | --- | --- |
| Direct Login | 0.5.2 | `2e196046c8cb18056f497eefad452d09ca802b81fedab150c48a3654a5817c7f` |
| Bridge | 0.1.7-payment-recovery | `df4c70b0fc91648f54a1cb1cb44451f9fa79525596332e1de6a6a8d0f9810245` |
| Entitlement Recovery | 0.1.1 | `9ab61b3b30ad23ff1894a3934d5adee98452e2ca0bb03845f74558c2a1f2461b` |

Đã đối chiếu bản sao với nội dung đọc từ trang quản trị và kiểm tra giải nén ZIP. Đây là bản sao mã plugin, **không phải** bản sao cơ sở dữ liệu WordPress, khóa ký, D1 hoặc R2. Bản sửa không thay đổi các tài nguyên đó. Bản Direct Login đang chạy khớp hoàn toàn với commit `16406decde529a8f3ca778cc82225bfcd400f857`.

## Lỗi và thay đổi

Quản trị ChấmPro ghi gói tặng vào D1; Direct Login 0.5.2 chỉ đọc `cpd_verified_plan` và `cpd_verified_expires`. Entitlement Recovery 0.1.1 phục hồi các quyền mua từ đơn hàng hợp lệ, không đọc gói tặng D1.

Bản sửa đọc `GET /api/me` bằng token do Bridge tạo cho đúng người dùng đã xác thực. API này có trong Worker hiện hữu, không cần triển khai Worker hoặc thêm secret. Token chỉ nằm trong yêu cầu HTTPS giữa hai máy chủ; không ghi log, không gửi tới app, không theo chuyển hướng.

Gói tặng 1 năm/trọn đời được dùng để ký giấy phép theo giao thức hiện tại. Không chép quyền tặng thành metadata mua hàng, không tạo đơn, không đặt lại ngày dùng thử. Giữ gói mua trọn đời hoặc thời hạn mua dài hơn đã được xác minh ở WordPress. Đây là sửa tương thích với hệ thống đang chạy, chưa phải chuyển toàn bộ quyền mua sang một nguồn duy nhất.

Phản hồi lỗi, sai tài khoản, ngày không hợp lệ hoặc cấu hình thiếu không tạo giấy phép Dùng thử thay thế. Phản hồi tài khoản tạm khóa được xử lý 403. Riêng phản hồi 404 chính xác của Worker về tài khoản chưa đăng ký D1 vẫn giữ hành vi dùng thử/quyền WordPress vốn có.

Chỉ cập nhật Direct Login. Giữ nguyên mã ký, tên option chứa khóa, issuer/audience, PKCE, các route đăng nhập/refresh, khóa thiết bị và CORS của bản đang chạy. Không sửa AAB/APK, camera, chấm bài, thanh toán, dữ liệu đồng bộ hoặc các Worker.

## Kiểm thử

- `tests/champro-gift-entitlement.test.mjs`: thực thi PHP với các tài khoản và phản hồi HTTP giả lập, xác minh chữ ký bằng WebCrypto, thử gói tặng, thời hạn, quyền mua, trial, khóa tài khoản, lỗi mạng, tài khoản khác, PKCE và refresh bằng chữ ký thiết bị.
- `tests/champro-gift-scope.test.mjs`: so sánh phần đăng nhập/ký/khóa/routes với bản 0.5.2 đã sao lưu; kiểm tra thư mục Android, camera/chấm, payment Worker và sync không thay đổi.
- Workflow `champro-gift-entitlement-qa.yml` chạy thêm các kiểm thử hiện hữu cho chữ ký, khóa, quyền mua, offline và refresh; chỉ đóng gói plugin WordPress, không build hoặc phát hành Android.

## Điều kiện trước triển khai

1. Mở lại được trang quản trị ChấmPro và kiểm tra tài khoản giả lập; bước này hiện bị giới hạn sử dụng của công cụ trình duyệt chặn, chưa thực hiện.
2. Xác nhận Bridge đang cấu hình đúng Worker và `GET /api/me` thực tế trả đúng schema; không thay Worker để ép tương thích.
3. Kiểm tra bản sao plugin vẫn khớp trước cập nhật. Nếu mã đã thay đổi, lấy bản sao mới và đối chiếu trước khi tiếp tục.
4. Chỉ thay plugin Direct Login bằng bản kiểm thử đạt; không đổi khóa hoặc cấu hình. Có thể hoàn tác bằng bản Direct Login 0.5.2 đã sao lưu.
5. Kiểm tra với hai tài khoản thử riêng: tặng annual/lifetime, refresh trên ứng dụng hiện có, không có quyền ở tài khoản khác, chữ ký và public key giữ nguyên, offline và camera hoạt động như trước.
6. Chưa kết luận đã khắc phục trên thiết bị thật hoặc triển khai thành công khi chưa có kết quả các bước trên. Giữ đồng bộ dữ liệu thật ở trạng thái cũ/tắt như yêu cầu riêng của dự án.
