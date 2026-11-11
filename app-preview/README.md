# ChấmPro Web · thử nghiệm công khai (11/2026)

Được xây dựng độc lập từ bộ nhận diện Beta Android trước đây. Dùng để thử **bộ chấm OMR mới trên trình duyệt và dùng chung mã nguồn cho Android**. Đây chưa phải bản phát hành thương mại và **không được gọi là hệ thống chấm đã kiểm chứng trên điện thoại Samsung**.

## Địa chỉ thử nghiệm

- Trang web cũ của ChấmPro vẫn giữ nguyên tại `https://champro.mrhien.com/`.
- App được đặt trong thư mục `/app/` để không phá trang cũ: `https://champro.mrhien.com/app/` sau khi tệp được push lên nhánh GitHub Pages.
- Không đổi bản ghi Cloudflare `champro` đang trỏ đến GitHub Pages.
- Để thêm menu tại mrhien.com (WordPress): **Giao diện → Menu** hoặc **Giao diện → Tùy biến → Menu**, thêm liên kết tùy chỉnh `https://champro.mrhien.com/app/`, nhãn **Chấm trắc nghiệm**.

## Đang hoạt động trong mã nguồn (chưa kiểm chứng điện thoại thật)

- Tạo kỳ kiểm tra; mẫu A4 120 câu hoặc 3 phần, mã đề 3/4 chữ số.
- Tọa độ 4 ô vuông và ô tô lấy trực tiếp từ **bốn PDF gốc người dùng cung cấp** (file `app/layouts.json`).
- Chọn bốn ô vuông bằng OpenCV.js, chỉnh phối cảnh, đọc SBD, mã đề, phần I, II, III; đọc qua camera hoặc ảnh tải lên.
- Quét tay với màn hình đối chiếu và sửa đáp án; tự động chỉ ghi khi đọc **hai lần nhất quán**, có SBD + mã đề hợp lệ, không có ô chưa rõ; không lưu phiếu trắng.
- Chấm điểm theo cấu hình; phần II 0/0.1/0.25/0.5/1; câu cho điểm toàn bộ `ALL`; hỗ trợ phần I nhiều đáp án; xuất kết quả CSV.
- Quản lý học sinh, import/export CSV; import XLSX nếu mạng tải được SheetJS; lưu offline trên **localStorage** của thiết bị, sao lưu/khôi phục JSON.
- Cài đặt PWA trên trình duyệt hỗ trợ. Camera yêu cầu HTTPS và quyền camera.

## Giới hạn quan trọng

- GitHub Pages chỉ phục vụ tệp tĩnh: **không có tài khoản, thanh toán, phân quyền, đồng bộ nhiều thiết bị hoặc database tập trung**. Không lưu danh sách học sinh/điểm vào GitHub công khai.
- OpenCV.js tải lần đầu từ `https://docs.opencv.org/4.10.0/opencv.js`, SheetJS từ `cdn.sheetjs.com` khi nhập Excel. Trước khi dùng offline, các thư viện cần được đóng gói cục bộ, kiểm tra bản quyền và kiểm chứng hiệu năng.
- Nhập XLSX có thể làm mất số 0 đầu SBD nếu Excel lưu dạng số. Import hỗ trợ pad SBD thành 6 chữ số; cần đối chiếu dữ liệu gốc.
- Chưa có phiếu thực tế đủ loại và kết quả chấm tay để xác nhận sai số; tuyệt đối không tự động phát hành thương mại hoặc hứa “siêu nhanh”.
- Bản APK được xây từ cùng web source bằng Capacitor nhưng cần kiểm tra quyền camera trên WebView, lưu trữ, hiệu năng và đóng gói ký số trước khi phát hành.

## Chạy local

Yêu cầu Node.js 22 trở lên:

```bash
npm install
npm test
npm run serve
```

Mở `http://localhost:8080` (localhost được phép dùng camera trên phần lớn trình duyệt).

## Android debug APK

Android Studio, Android SDK, JDK tương thích Capacitor 8 phải được cài trên máy Windows:

```powershell
npm install
npx cap add android
npx cap sync android
npx cap open android
```

Trong `android/app/src/main/AndroidManifest.xml`, rà soát quyền CAMERA, theo quy định Capacitor/Android hiện hành. Từ Android Studio chọn `Build APK(s)`. Đây là **APK debug để thử**, không phải APK thương mại đã ký. Luồng `getUserMedia` trong WebView phải được kiểm thử trên Samsung trước khi phát hành.

## Kiểm thử bắt buộc trước phát hành

1. Thử đủ 4 mẫu phiếu từ ảnh Samsung thực tế (mã đề 3/4; 120 câu/3 phần).
2. Thử phiếu lệch, chói sáng, nhòe, gấp, quá gần, quá xa; **không lưu bài nếu chưa chắc chắn**.
3. Đối chiếu 100% mã đề/SBD/từng ô tô với đáp án tô thật; kiểm tra đúng-sai/tính điểm và lịch sử.
4. Kiểm tra đọc lại phiếu, chống lưu trùng, chỉnh sửa đáp án/đề lỗi và điểm xuất CSV.
5. Chạy trên thiết bị không có mạng và xác nhận thư viện đã được tải cục bộ.

## Quyền riêng tư

Mã nguồn ứng dụng công khai; hồ sơ và điểm nằm **trên trình duyệt của thiết bị**. Tránh sử dụng trên máy dùng chung; sao lưu dữ liệu và bảo vệ thiết bị. Chưa có chứng nhận bảo vệ dữ liệu cá nhân hoặc backup đồng bộ.