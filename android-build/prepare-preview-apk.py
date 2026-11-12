#!/usr/bin/env python3
"""Prepare isolated, fully bundled ChấmPro preview for Android WebView."""
from pathlib import Path
import sys
import re

root = Path(sys.argv[1])
assert root.is_dir()
html = root / "index.html"
s = html.read_text(encoding="utf-8")
# Remove external navigation that would unexpectedly leave the offline app.
# Internal app modules and grading logic are copied unchanged.
s = s.replace('href="/app/"', 'href="./"')
s = s.replace('href="/#tai-ung-dung"', 'href="./"')
s = s.replace('href="/qr-excel.html"', 'href="https://champro.mrhien.com/qr-excel.html"')
s = s.replace('href="/tron-de/"', 'href="https://champro.mrhien.com/tron-de/"')
s = s.replace('href="/ho-tro.html"', 'href="https://champro.mrhien.com/ho-tro.html"')
# Capacitor already serves bundled content locally; PWA service workers
# cannot be assumed to be supported in the Android WebView.
# The APK has a dedicated, native-style presentation layer.
# The original preview app remains unchanged and is still the grading engine.
native_css = root / "native-app.css"
native_js = root / "native-app.js"
assert native_css.is_file() and native_js.is_file()
s = s.replace("</head>", '<link rel="stylesheet" href="./native-app.css"></head>', 1)
s = s.replace("</body>", '<script defer src="./native-app.js"></script></body>', 1)
# APK-only photo review wrapper: preserve the original grader, overlays and
# stored photos, then crop/deskew the annotated canvas for visual inspection.
app_js = root / "app.mjs"
app_code = app_js.read_text(encoding="utf-8")
original_import = "import {enqueueSheetPhoto,showSheetPhoto} from './sheet-photo-store.mjs';"
assert original_import in app_code, "Photo import changed; do not silently patch"
app_code = app_code.replace(original_import,
 "import {enqueueSheetPhoto,showSheetPhoto} from './photo-review-apk.mjs';", 1)
app_js.write_text(app_code, encoding="utf-8")

# This app is already bundled in the APK. Never register a browser service worker
# that could pin an obsolete web layout or delay the native presentation.
s = re.sub(r'<script type="module" src="\./pwa-install\.mjs\?v=[^"]+"></script>', '', s)
# APK-only WordPress sign-in and in-app packages. Keep unchanged OMR, camera,
# grading, QR import, result editor, photo archive and local offline storage.
account_module = root / "account-direct.mjs"
license_module = root / "offline-license.mjs"
assert account_module.is_file() and license_module.is_file()
s = s.replace("</head>", """<style>
html.cp-license-pending body > :not(#cpAccountGate){display:none!important}
#cpAccountGate[hidden]{display:none!important}
#cpAccountGate{position:fixed;inset:0;z-index:2147483646;display:flex;
 align-items:center;justify-content:center;overflow-y:auto;padding:18px;
 background:#f4f7fc;color:#163456;font-family:system-ui,Arial,sans-serif}
.cp-account-card{max-width:480px;width:100%;max-height:96vh;overflow:auto;box-sizing:border-box;
 background:white;border-radius:22px;padding:24px 20px;box-shadow:0 16px 45px #1e385726}
.cp-account-card h1{font-size:26px;margin:0 0 4px;color:#16395f}
.cp-account-card h2{font-size:19px;margin:12px 0}
.cp-account-card p{font-size:14px;line-height:1.6}
.cp-account-card button{width:100%;border:0;border-radius:11px;background:#1664ce;color:white;
 padding:13px 10px;font-size:15px;font-weight:700;margin:7px 0;cursor:pointer;min-height:46px}
.cp-account-card button.secondary{color:#164676;background:#eaf1fb;border:1px solid #bdd1ed}
.cp-account-card button:disabled{opacity:.6}
.cp-account-card .cp-pair-code{font-size:29px;letter-spacing:3px;font-weight:800;
 border:1px dashed #a7c2e2;border-radius:12px;padding:14px;text-align:center}
.cp-account-card .cp-plan{border:1px solid #d9e4f0;padding:14px;border-radius:13px;margin:10px 0}
.cp-account-card .cp-tag{background:#e7f2ff;padding:8px 10px;border-radius:8px;font-size:13px}
.cp-account-card [hidden]{display:none!important}
#cpAuthStatus{color:#aa452b;min-height:20px;font-size:13px;overflow-wrap:anywhere}
#cpAccountClose{background:#edf2f9;color:#26476d}
</style><script>document.documentElement.classList.add('cp-license-pending')</script></head>""", 1)
s = s.replace("</body>", """<section id="cpAccountGate" role="dialog" aria-modal="true" aria-label="Tài khoản ChấmPro">
<div class="cp-account-card">
<h1>ChấmPro Test v14.4</h1>
<p><strong>Đăng ký và đăng nhập</strong> để chấm bài hoàn toàn offline sau khi kích hoạt. Không cần nhập giấy phép thủ công.</p>
<p class="cp-tag" id="cpCurrentPlan" role="status">Chưa kích hoạt</p>
<div id="cpViewLogin">
<h2>Tài khoản mrhien.com</h2>
<p>Một tài khoản dùng chung với website. Chỉ cần Internet khi đăng nhập và nâng cấp gói.</p>
<button type="button" id="cpSignIn">Đăng ký / Đăng nhập</button>

</div>
<div id="cpViewWaiting" hidden>
<h2>Kết nối tài khoản</h2>
<p>Mã ghép nối có hiệu lực 10 phút và chỉ dùng một lần:</p>
<div class="cp-pair-code" id="cpPairCode">---------</div>
<button type="button" id="cpOpenWeb" hidden>Tiếp tục đăng nhập trên mrhien.com</button>
<button type="button" class="secondary" id="cpPairCheck">Thử kiểm tra kết nối</button>
<button type="button" class="secondary" id="cpPairRetry">Tạo mã kết nối mới</button>
</div>
<div id="cpViewPlans" hidden>
<h2>Gói sử dụng</h2>
<p>Thanh toán QR ngân hàng qua WooCommerce và SePay. Sau khi thanh toán được xác nhận, ứng dụng tự nhận quyền khi có Internet.</p>
<div class="cp-plan"><strong>Gói 1 năm</strong><p>Giá hiển thị và xác nhận tại mrhien.com trước khi thanh toán.</p>
<button id="cpBuyAnnual" type="button">Chọn gói 1 năm · Thanh toán QR</button></div>
<div class="cp-plan"><strong>Gói trọn đời</strong><p>Chỉ thanh toán một lần theo chính sách gói.</p>
<button id="cpBuyLifetime" type="button">Chọn gói trọn đời · Thanh toán QR</button></div>
<button class="secondary" type="button" id="cpRefreshPlan">Kiểm tra thanh toán / Cập nhật gói</button>
<button class="secondary" type="button" id="cpReLogin">Đăng nhập tài khoản khác</button>
</div>
<p id="cpAuthStatus" role="status">Đang kiểm tra quyền offline…</p>
<button id="cpAccountClose" type="button">Quay lại ChấmPro</button>
<button class="secondary" id="cpAccountLogout" type="button">Đăng xuất khỏi thiết bị</button>
<div id="cpUpdaterPanel" class="cp-plan"><h2>Cập nhật ChấmPro</h2><p id="cpUpdateStatus" role="status">Phiên bản thử nghiệm hiện tại v14.4. Ứng dụng vẫn chấm hoàn toàn offline.</p><button class="secondary" id="cpUpdateCheck" type="button">Kiểm tra phiên bản mới</button><button id="cpUpdateDownload" type="button" hidden>Tải bản cập nhật chính thức</button><p id="cpUpdateDetails" hidden></p></div>
<small>Chỉ tính điểm trên thiết bị. Không truyền ảnh phiếu và dữ liệu học sinh lên máy chủ để chấm bài.</small>
</div></section>
<script type="module" src="./account-direct.mjs"></script><script type="module" src="./update-app.mjs"></script></body>""",1)

html.write_text(s, encoding="utf-8")
# Ensure the bundled libraries needed for offline QR and Excel are present.
for filename in ["app.mjs", "advanced.mjs", "qr-compatible.mjs",
                 "compact-answer-ui.mjs", "compact-points.mjs",
                 "vendor/jsQR.js", "vendor/xlsx.full.min.js",
                 "layouts.json", "sheet-photo-store.mjs"]:
    assert (root / filename).is_file(), filename
print("PASS: offline preview bundle is complete")
