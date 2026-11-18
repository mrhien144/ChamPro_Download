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
# v15 APK-only owner-scoped records + photo archive + safety mirror.
# The web preview source remains untouched. Never move legacy data implicitly.
app_code = "import {accountStore} from './apk-account-storage.mjs';\n" + app_code
for old,new in [
 ("const storedKey='champro-app-preview-v1';", "const storedKey=accountStore.data;"),
 ("function applySyncDb(next){", "function applySyncDb(next){\n if(!accountStore.owner||'wp:'+window.champroAccountIdentity?.wpUserId!==accountStore.owner)throw Error('Phiên đồng bộ đã thay đổi');"),
 ("getDb,applySyncDb,isCameraBusy:()=>Boolean(captureBusy||stream)", "getDb,applySyncDb,syncOwner:accountStore.owner,isCameraBusy:()=>Boolean(captureBusy||stream||$('reviewDialog').open)")
]:
    assert old in app_code, old
    app_code = app_code.replace(old,new,1)
for filename,old,new in [
 ("sheet-photo-store.mjs","const DB_NAME='champro-sheet-photos-preview-v1',STORE='photos';","const DB_NAME=accountStore.photos,STORE='photos';"),
 ("local-data-store.mjs","const DB_NAME='champro-local-mirror-preview-v1',STORE='snapshots',KEY='latest';","const DB_NAME=accountStore.mirror,STORE='snapshots',KEY='latest';")
]:
    p=root/filename
    code=p.read_text(encoding="utf-8")
    assert old in code, filename
    code="import {accountStore} from './apk-account-storage.mjs';\n"+code.replace(old,new,1)
    p.write_text(code,encoding="utf-8")
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
.cp-account-card{max-width:470px;width:100%;max-height:94dvh;overflow:auto;box-sizing:border-box;
 background:white;border-radius:24px;padding:20px 18px;box-shadow:0 18px 48px #1e385726}
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
.cp-account-card .cp-tag{display:block;background:#e7f2ff;padding:12px;border-radius:12px;font-size:14px;font-weight:650}
.cp-account-card .cp-account-subtitle{color:#62758d;font-size:13px;margin:5px 0 14px}
.cp-account-card .cp-account-details{margin:12px 0;border:1px solid #dce7f5;border-radius:14px;padding:0 12px;background:#fbfdff}
.cp-account-card .cp-account-details>summary{cursor:pointer;list-style:none;padding:15px 2px;font-weight:750;color:#21466c}
.cp-account-card .cp-account-details>summary:after{content:"⌄";float:right}
.cp-account-card .cp-account-details[open]>summary:after{content:"⌃"}
.cp-account-card .cp-account-details>summary::-webkit-details-marker{display:none}
.cp-account-card .cp-account-details .cp-plan{margin:8px 0}
.cp-account-card .cp-account-help{font-size:12px;color:#687a90;line-height:1.5;margin:10px 0}
.cp-account-card #cpAccountLogout{background:transparent;color:#677c94;border:1px solid #dce6f2;font-size:13px}
.cp-account-card #cpAuthStatus{border-radius:11px;background:#edf5ff;padding:10px 12px}
.cp-account-card #cpAuthStatus[data-level="error"]{background:#fff1f0}
.cp-account-card #cpAuthStatus[data-level="success"]{background:#e8f8ef}
.cp-account-card [hidden]{display:none!important}
#cpAuthStatus{color:#30557f;min-height:20px;font-size:13px;overflow-wrap:anywhere}
#cpAuthStatus[data-level="error"]{color:#b42318}
#cpAuthStatus[data-level="success"]{color:#087443}
#cpAccountClose{background:#edf2f9;color:#26476d}
</style><script>document.documentElement.classList.add('cp-license-pending')</script></head>""", 1)
s = s.replace("</body>", """<section id="cpAccountGate" role="dialog" aria-modal="true" aria-label="Tài khoản ChấmPro">
<div class="cp-account-card">
<h1>Tài khoản ChấmPro</h1>
<p class="cp-account-subtitle">Dùng chung tài khoản mrhien.com · Chấm bài offline</p>
<p class="cp-tag" id="cpCurrentPlan" role="status">Chưa kích hoạt</p>
<div id="cpViewLogin">
<h2>Đăng nhập</h2>
<p>Đăng nhập một lần để kích hoạt ChấmPro trên điện thoại.</p>
<button type="button" id="cpSignIn">Đăng ký / Đăng nhập</button>

</div>
<div id="cpViewWaiting" hidden>
<h2>Đang xác thực</h2>
<p>Hoàn tất đăng nhập trên mrhien.com rồi quay lại ứng dụng.</p>
<div class="cp-pair-code" id="cpPairCode" hidden>---------</div>
<button type="button" id="cpOpenWeb" hidden>Tiếp tục đăng nhập trên mrhien.com</button>
<button type="button" class="secondary" id="cpPairCheck">Thử kiểm tra kết nối</button>
<button type="button" class="secondary" id="cpPairRetry">Tạo mã kết nối mới</button>
</div>
<div id="cpViewPlans" hidden>
<h2>Gói sử dụng</h2>
<button class="secondary" type="button" id="cpRefreshPlan">Cập nhật quyền sử dụng</button>
<details class="cp-account-details"><summary>Thông tin gói sử dụng</summary>

<div class="cp-plan"><strong>Gói 1 năm</strong><p>Sử dụng đầy đủ tính năng trong 1 năm.</p></div>
<div class="cp-plan"><strong>Gói trọn đời</strong><p>Sử dụng lâu dài, không cần gia hạn.</p></div>
<div class="cp-plan" style="background:#eef5ff"><strong>Thông tin nâng cấp</strong><p>Bạn có thể nâng cấp quyền sử dụng tại website chính thức của ChấmPro.</p><p><strong>champro.mrhien.com</strong></p><p>Quyền sử dụng được tự động cập nhật theo tài khoản khi có mạng. Bạn cũng có thể chọn Cập nhật quyền sử dụng.</p></div>
</details>
<details class="cp-account-details"><summary>Đổi tài khoản</summary>
<button class="secondary" type="button" id="cpReLogin">Đăng nhập tài khoản khác</button>
</details>
</div>
<p id="cpAuthStatus" role="status">Đang kiểm tra quyền offline…</p>
<button id="cpAccountClose" type="button">Quay lại ChấmPro</button>
<button class="secondary" id="cpAccountLogout" type="button">Đăng xuất khỏi thiết bị</button>
<details class="cp-account-details"><summary>Cập nhật ứng dụng</summary><p>ChấmPro v16. Cập nhật phiên bản qua Google Play.</p></details>
<p class="cp-account-help">Dữ liệu chấm được lưu trên thiết bị. Hãy sao lưu trước khi gỡ ứng dụng.</p>
</div></section>
<script type="module" src="./account-direct.mjs"></script></body>""",1)

# APK-only product copy. No changes to camera, grader or stored records.
# Use truthful local-storage warnings until production D1/R2 sync is deployed.
s = s.replace('BẢN THỬ NGHIỆM RIÊNG', 'ỨNG DỤNG CHẤM BÀI')
s = s.replace('content="ChấmPro Test"', 'content="ChấmPro"')
s = s.replace(
 'Đăng nhập WordPress để kiểm tra kết nối D1/R2. Chỉ kiểm tra tài khoản và trạng thái API; chưa tải học sinh, đề, điểm hay ảnh phiếu lên máy chủ.',
 'Quyền sử dụng được quản lý theo tài khoản. Dữ liệu chấm được đồng bộ trong nền chỉ sau khi máy chủ và thiết bị xác thực thành công.'
)
s = s.replace('Đồng bộ Cloudflare D1/R2 chưa kích hoạt.',
 'Đồng bộ Cloudflare chỉ chạy sau khi máy chủ xác nhận an toàn.')
s = s.replace('Không tự tải dữ liệu lên máy chủ.',
 'Dữ liệu chỉ được tải lên máy chủ khi tính năng đồng bộ và tài khoản được xác minh.')
s = s.replace('Đồng bộ Cloudflare chưa tự động.',
 'Đồng bộ hoạt động khi tài khoản và máy chủ được xác minh.')

s = s.replace(
 'BẢN THỬ NGHIỆM /app-preview/: dữ liệu trong bản này tách riêng khỏi /app/. Không nhập dữ liệu học sinh thật. Hãy sao lưu thường xuyên. Không dùng chế độ ẩn danh hoặc xóa dữ liệu trang web nếu muốn giữ kết quả.',
 'Dữ liệu học sinh, đáp án, kết quả và ảnh phiếu được lưu trên thiết bị để chấm offline. Đồng bộ tự động khi tài khoản và máy chủ được xác thực. Hãy sao lưu dữ liệu trước khi gỡ hoặc cài lại ứng dụng.'
)
s = s.replace('Kết nối tài khoản ChấmPro (thử nghiệm)', 'Tài khoản ChấmPro')
s = s.replace(
 'Phiên bản thử nghiệm chưa có tài khoản, phân quyền, đồng bộ đa thiết bị, thanh toán hoặc hệ thống cấp phép. Những thành phần đó cần máy chủ bảo mật riêng, không thể triển khai an toàn bằng GitHub Pages tĩnh.',
 'Tài khoản, gói sử dụng và thanh toán ChấmPro được xác minh qua mrhien.com. Dữ liệu chấm được lưu riêng theo tài khoản và đồng bộ khi máy chủ cho phép.'
)
s = s.replace(
 'Phiên đăng nhập chỉ được giữ trong bộ nhớ của trang này, không ghi vào localStorage. Đóng trang sẽ cần đăng nhập lại.',
 'Tài khoản ứng dụng đã xác thực được ghi nhớ trên thiết bị; khi offline, giấy phép đã ký còn hiệu lực vẫn dùng được. Trạng thái đồng bộ dữ liệu sẽ được hiển thị riêng khi tính năng được kích hoạt.'
)
s = s.replace('<h1>ChấmPro Test v14.5</h1>', '<h1>ChấmPro</h1>')
s = s.replace(
 'Phiên bản thử nghiệm hiện tại v14.5. Ứng dụng vẫn chấm hoàn toàn offline.',
 'Ứng dụng vẫn hỗ trợ chấm bài offline.'
)
s = s.replace(
 '<small>Chỉ tính điểm trên thiết bị. Không truyền ảnh phiếu và dữ liệu học sinh lên máy chủ để chấm bài.</small>',
 '<p class="cp-account-help">Chấm bài offline. Đồng bộ đám mây chỉ hoạt động sau khi máy chủ xác thực.</p>'
)

# Android-only background sync module. It is gated by the dedicated
# first-party auth service and an OFF-by-default isolated Cloudflare Worker.
# It never modifies or awaits camera/OMR/grading functions.
assert (root / "app-sync.mjs").is_file()
assert (root / "sync-device.mjs").is_file()
assert (root / "sync" / "start.mjs").is_file()
s = s.replace('</body>', '<script type="module" src="./app-sync.mjs"></script></body>', 1)

html.write_text(s, encoding="utf-8")
# Ensure the bundled libraries needed for offline QR and Excel are present.
for filename in ["app.mjs", "advanced.mjs", "qr-compatible.mjs",
                 "compact-answer-ui.mjs", "compact-points.mjs",
                 "vendor/jsQR.js", "vendor/xlsx.full.min.js",
                 "layouts.json", "sheet-photo-store.mjs"]:
    assert (root / filename).is_file(), filename
print("PASS: offline preview bundle is complete")
