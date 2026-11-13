# ChấmPro v14.5.1 – Sửa nhãn Trực tuyến/Ngoại tuyến

- **Chỉ sửa trạng thái kết nối trên thanh đầu APK**, không sửa camera, bộ nhận diện, tính điểm, ảnh phiếu, kết quả hay dữ liệu.
- Trước đây `navigator.onLine` trong Android WebView có thể báo `true` sau khi mất mạng. Giờ dùng `@capacitor/network` với `Network.getStatus()` và sự kiện `networkStatusChange`.
- Tắt Wi-Fi và dữ liệu di động: hiển thị `Ngoại tuyến` và chấm vẫn hoàn toàn offline. Bật lại: `Trực tuyến`. Tự làm mới khi app hiện lên.
- Không ping máy chủ, không gửi dữ liệu và không đặt các lần kiểm tra mạng trong vòng chấm phiếu.
- `versionCode` của bản sửa là **14501**; `applicationId` giữ nguyên `com.champro.nativepreview.v145`.

## LƯU Ý RẤT QUAN TRỌNG CHO DỮ LIỆU NGƯỜI DÙNG

Đây là APK **debug** build trên GitHub Actions. Tệp 14.5 gốc và 14.5.1 có thể được ký bởi các debug keystore khác nhau. Android sẽ từ chối cập nhật đè nếu chứng chỉ ký khác. **Không gỡ cài đặt v14.5 đang chứa dữ liệu** để cố cài bản mới. Không sử dụng quyền root, không xóa bộ nhớ ứng dụng, không làm mất đề/đáp án/ảnh phiếu.

Trước bản phát hành chính thức phải có khóa ký release ổn định và dùng cùng package ID qua các bản nâng cấp. Nếu không có cùng chứng chỉ với 14.5, cần kiểm thử trên một thiết bị không chứa dữ liệu hoặc cấu hình cơ chế sao lưu/phục hồi được kiểm chứng. Bản này KHÔNG được coi là tự cập nhật tại chỗ an toàn.

## Kiểm thử chấp nhận

1. Cài APK trên thiết bị thử nghiệm, mở ứng dụng.
2. Khi có mạng: chấm xanh và `Trực tuyến`.
3. Tắt cả Wi-Fi và dữ liệu di động: chuyển sang chấm màu cam và `Ngoại tuyến`.
4. Trong khi offline, chấm thử 5–10 phiếu, xem kết quả, kiểm tra ảnh lưu. Tốc độ phải so với bản 14.5 trên cùng thiết bị.
5. Kết nối lại mạng: chuyển sang `Trực tuyến`.
6. Chuyển ứng dụng về nền rồi mở lại, nhãn đúng với trạng thái hiện tại.
7. Không thay thế v14.5 mà chưa sao lưu đầy đủ dữ liệu và xác nhận chứng chỉ ký tương thích.
