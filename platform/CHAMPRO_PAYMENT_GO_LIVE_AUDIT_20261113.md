# ChấmPro — kiểm tra mở thanh toán (2026-11-13)

**Trạng thái: NOT READY — KHÔNG MỞ GIAO DỊCH THẬT.** Không tự đổi `PURCHASES_OPEN` hoặc đặt hằng `CHAMPRO_LIVE_CHECKOUT_ENABLED`/`CHAMPRO_LIVE_GRANTS_ENABLED` thành true trước khi hoàn thành kiểm chứng.

## Những gì đã xác minh từ mã nguồn
- Trang `platform/account/account.js` đang khóa nút mua gói bằng `PURCHASES_OPEN=false`.
- Worker main đang dùng `champro-platform-staging` và chứa hạn mức 100/5/5; bản này không phải bản thanh toán đang thử.
- Pull request **#16** đưa ra phương án tích hợp SePay 1.1.23 → WooCommerce → Cloudflare; vẫn chưa merge và ghi rõ chỉ thử nghiệm.
- Bản thanh toán an toàn tại PR #16 có hai lớp chặn riêng: plugin `champro-checkout-gate.php` không cho tạo đơn nếu chưa mở cả `CHAMPRO_LIVE_CHECKOUT_ENABLED` và `CHAMPRO_LIVE_GRANTS_ENABLED`; Bridge cũng khóa quyền khi chưa bật `CHAMPRO_LIVE_GRANTS_ENABLED`.
- Sản phẩm được nêu trong PR: WooCommerce **8919** (99.000 VND, 12 tháng) và **8920** (299.000 VND, trọn đời). **Lưu ý: bản Worker thanh toán ở PR #16 có wrangler.jsonc đang ghi 7726/7727 cho chế độ TEST, khác với 8919/8920. Tuyệt đối không triển khai nhầm ID.**
- Tests mô phỏng trong GitHub chỉ xác nhận hợp đồng phần mềm; không chứng minh webhook/ngân hàng thật đã giao dịch thành công.
- Main `app/index.html` dùng mã `app/app.mjs` chưa có `champroScanLicense.charge(...)`, nên chưa thể khẳng định 100 lượt chấm được trừ đồng bộ trên site chính. Bản thử nghiệm riêng có logic trừ lượt. Cần hoàn thiện và kiểm thử Offline trước khi phát hành thương mại.

## Điều kiện bắt buộc — ghi nhận đạt bằng bằng chứng thực
- [ ] Sao lưu WordPress/WooCommerce, D1 và phiên bản ChấmPro đang chạy; thử phục hồi và có phương án rollback.
- [ ] Kiểm tra sản phẩm 8919/8920: trạng thái Published, Simple, Virtual, giá và VND chính xác; giỏ hàng chỉ chứa một gói, không áp dụng voucher/gateway khác.
- [ ] Tích hợp bản Bridge an toàn với SePay 1.1.23. Cài đặt WordPress chính thức, không đè plugin đăng nhập v14.5 ngoài phạm vi; xác nhận số giao dịch và người mua thật.
- [ ] Đồng nhất `PRODUCT_ANNUAL_ID=8919`, `PRODUCT_LIFETIME_ID=8920` ở Worker sản xuất và Bridge. Không sử dụng Worker/D1 thanh toán TEST có 7726/7727, hoặc dữ liệu receipts giả.
- [ ] Xác minh webhook SePay ký/xác thực theo plugin đang cài, số tiền chính xác, một đơn / một khách / một giao dịch. Đơn chưa thanh toán, hoàn tất thủ công, sai số tiền, callback trùng → không cấp nhầm quyền.
- [ ] Kiểm thử thực end-to-end: chuyển khoản 99.000đ có chứng từ, WooCommerce xác nhận, Worker cấp annual chính xác 12 tháng, trang tài khoản cập nhật đúng; tương tự 299.000đ lên lifetime.
- [ ] Kiểm thử tiền đã về nhưng API lỗi: retry đối soát **không cấp hai lần**; thu hồi/hoàn tiền theo chính sách, lịch sử quản trị.
- [ ] Kiểm thử quét QR, trộn đề và chấm bài: mỗi lần thành công trừ đúng một lượt free, không trừ khi thất bại, không trừ khi mở lại dữ liệu; dữ liệu đồng bộ giữa thiết bị cần kiểm nghiệm độc lập.
- [ ] Kiểm thử trạng thái mạng ngoại tuyến của APK: người dùng trả phí vẫn chấm Offline theo giấy phép và đồng bộ đúng khi trở lại Online; không phá bộ chấm.
- [ ] Chạy CI staging, thử giao dịch thật trong môi trường kiểm soát, giám sát logs/đơn/thanh toán. Không mở diện rộng khi chưa đạt.
- [ ] Chỉ sau tất cả các bước trên: bật 2 cờ server + cấu hình sản phẩm; mở nút mua gói ở account frontend trong **cùng một đợt phát hành**, xác nhận mua thử; nếu thất bại rollback nhanh.

## Khảo sát kỹ thuật cần can thiệp
1. WooCommerce & WordPress `mrhien.com`: quản trị viên phải kiểm tra các sản phẩm và xác nhận tình trạng plugins, SePay credentials. GitHub không cho biết trạng thái chạy thật.
2. Cloudflare Worker/D1: triển khai riêng, xem bindings, CORS, chống cấp trùng, nhật ký thanh toán, chính sách giới hạn offline.
3. APK/Web: không thay camera/OMR; kết nối cơ chế cấp phép đã thử nghiệm qua adapter riêng, có bài kiểm thử để tránh sai lệch kết quả.
4. Front-end: không tự bật `PURCHASES_OPEN=true` nếu checkout chưa sẵn sàng; ưu tiên xác nhận năng lực mua trên backend và kiểm tra thực tế.

Tài liệu này chỉ là **báo cáo kỹ thuật trước mở bán**; nó không triển khai cổng ngân hàng, không thay đổi dịch vụ production và không nhận tiền.
