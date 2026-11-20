# ChấmPro: sửa quyền gói tặng trên máy chủ

## Trạng thái

**Direct Login 0.5.4 đã triển khai lên mrhien.com ngày 20/11/2026. Người dùng đã xác nhận ứng dụng đang cài hiển thị đúng gói được tặng sau khi bấm Cập nhật quyền sử dụng.**

Mã đọc lại từ trình sửa plugin sau khi tải lại trang khớp hoàn toàn với `platform/wordpress/champro-direct-login.php` (22569 byte, SHA-256 `5578b3ce32fc75e10fc6cd45fc7aecd1e6d847da96aacbf3b318877d91d911c9`). Danh sách plugin xác nhận phiên bản 0.5.4 đang hoạt động. Chỉ cập nhật file Direct Login; không merge nhánh Android hoặc triển khai Worker.

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
- [CI cho commit 7fe3322](https://github.com/mrhien144/ChamPro_Download/actions/runs/44686899650): PHP lint đạt; **45/45 kiểm thử đạt**, không bỏ qua, gồm 3 ca cho trang preflight tạm thời.

## Xác minh triển khai thực tế

1. Đã mở lại trang quản trị và xác thực bằng phiên WordPress hiện có; giới hạn truy cập trước đó đã hết chặn thao tác.
2. Đã đối chiếu mã Direct Login đang chạy với bản sao lưu 0.5.2 trước cập nhật: khớp byte.
3. Trước khi thay logic cấp giấy phép, tạm thêm helper chỉ đọc và trang kiểm tra quản trị vào bản 0.5.2. Trang này yêu cầu `manage_options` và nonce, không ghi dữ liệu, không xuất token hoặc khóa riêng. Chữ ký kiểm tra dùng issuer/audience riêng, không phải giấy phép ứng dụng.
4. WordPress gọi API thực tế cho 3 tài khoản có sẵn: trọn đời, 1 năm, miễn phí. Tất cả trả đúng tài khoản/gói; gói 1 năm khớp ngày hết hạn trong quản trị. Không tặng, đổi, xóa hoặc đặt lại gói của các tài khoản này.
5. Chữ ký kiểm tra hợp lệ ở cả 3 ca. Sau đó thay bằng đúng file 0.5.4 đã kiểm thử và đọc lại để xác minh hash. Mã preflight tạm thời đã được gỡ khỏi plugin đang chạy.
6. Sau cập nhật, API public-key vẫn hoạt động; public key, issuer và audience giống trước cập nhật. Đăng nhập quản trị mới thành công, 3 gói kiểm tra vẫn giữ nguyên.
7. Ngày 20/11/2026, chủ dự án xác nhận trên ứng dụng đang cài: bấm **Cập nhật quyền sử dụng** đã hiển thị đúng gói được tặng. Đây là xác nhận thực tế của người dùng; chưa bao gồm kiểm thử chấm offline hoặc đồng bộ dữ liệu.

## Phần còn cần xác nhận

- Còn cần xác nhận chấm khi ngắt mạng trên điện thoại thật sau cập nhật quyền. Không coi kiểm thử giả lập là thay thế bước này.
- Chưa bật hoặc xác nhận đồng bộ kỳ kiểm tra, học sinh, đáp án, điểm, ảnh phiếu. Không triển khai `champro-sync-staging`, không chạy migration D1 hay thay đổi R2 trong đợt sửa quyền này.
- Hoàn tác khi cần bằng đúng mã Direct Login 0.5.2 đã sao lưu; giữ nguyên option khóa ký và dữ liệu người dùng. Không gỡ ứng dụng hoặc xóa dữ liệu điện thoại.
