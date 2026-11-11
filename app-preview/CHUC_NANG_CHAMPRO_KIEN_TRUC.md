# ChấmPro: Yêu cầu toàn hệ thống & trạng thái triển khai

## A. Đã có trong bộ nguồn Web Beta (chưa kiểm thử Samsung)

- Form A4 120 câu hoặc 3 phần I/II/III, đọc SBD và mã đề 3/4 số bằng tọa độ PDF gốc.
- Quét camera qua HTTPS, ảnh tải lên, chế độ tự quét và nút quét; đối chiếu, chỉnh sửa phiếu trước lưu.
- Quản lý kỳ kiểm tra, mã đề, đáp án; điểm I/II/III cấu hình; câu I đa đáp án/ALL; các câu II ALL, III ALL.
- Danh sách học sinh theo SBD, tên, lớp; nhập CSV/XLSX; kết quả và xuất CSV; sao lưu/khôi phục JSON.
- Giao diện responsive, PWA, nguồn chung cho Android Capacitor.

## B. Yêu cầu trước khi coi là đầy đủ tính năng ChấmPro

- Backend có xác thực tài khoản, phân quyền và lưu đám mây có phân tách theo chủ tài khoản; bảo đảm dữ liệu học sinh riêng tư. GitHub Pages **không đủ** cho chức năng này.
- Chế độ offline tương đương SQLite cũ: IndexedDB, bản ghi giao dịch và đồng bộ an toàn hai chiều khi có mạng; không được làm mất dữ liệu cũ.
- Đáp án nhập Excel và QR; tạo mã QR, đọc mã QR; mã đề 3/4 số, sửa được bộ đáp án sau khi nhập.
- Điểm cho đề lỗi: Phần I nhiều đáp án hoặc điểm toàn câu; Phần III cho điểm toàn câu; cập nhật lại kết quả theo quy tắc tương ứng; tất cả thay đổi cần kiểm thử.
- Quản lý lớp/khối/môn/học sinh/kỳ kiểm tra/bảng điểm; mẫu xuất Excel theo mẫu ChấmPro, tổng hợp và xếp hạng.
- Hỗ trợ cắt/đọc CCCD chính xác 4 góc theo tiêu chuẩn đã chốt (cần mô-đun riêng và yêu cầu quyền riêng tư).
- Gửi Zalo thủ công (OA tự động chưa triển khai), xuất báo cáo Word/PDF nếu yêu cầu.
- Bản thương mại: dùng thử 7 ngày, lifetime 299.000đ, cấp phép và thanh toán từ backend; không đưa khóa API ra repo public.
- APK Android: build bản release ký số riêng, kiểm tra quyền camera, tốc độ OMR, đóng gói thư viện WASM, cài đặt và cập nhật tự động; kiểm thử offline trên Samsung.
- Khẳng định chấm nhanh/chính xác dựa trên ảnh thật, tối thiểu 100 phiếu đại diện mỗi dạng; hồ sơ kiểm thử có số phiếu đúng từng ô, tỷ lệ lỗi và P95 thời gian chấm.

**Không bật công khai cho giáo viên sử dụng dữ liệu thật cho đến khi hoàn thành phần B và kiểm toán tính đúng đắn.**