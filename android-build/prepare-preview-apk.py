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
# APK-only signed-license gate. HTML/CSS and license module never touch
# existing camera, OMR, grading, photo storage or keyboard handlers.
license_module = root / "offline-license.mjs"
assert license_module.is_file(), "Offline license verifier is required for v14"
s = s.replace("</head>", """<style>
html.cp-license-pending body > :not(#cpLicenseGate){display:none!important}
#cpLicenseGate[hidden]{display:none!important}
#cpLicenseGate{position:fixed;inset:0;z-index:2147483646;background:#f4f7fc;overflow-y:auto;
 color:#152d50;display:flex;align-items:center;justify-content:center;padding:18px;font-family:system-ui,sans-serif}
#cpLicenseGate .cp-license-card{background:white;border-radius:22px;max-width:480px;width:100%;box-sizing:border-box;
 box-shadow:0 12px 48px #20365d28;padding:28px 22px}
#cpLicenseGate h1{font-size:25px;margin:4px 0 6px;color:#153960}
#cpLicenseGate p{line-height:1.5;font-size:14px}
#cpLicenseGate label{display:block;font-weight:700;font-size:14px;margin:18px 0 7px}
#cpLicenseGate input,#cpLicenseGate textarea{width:100%;box-sizing:border-box;padding:12px;border:1px solid #b8c9db;border-radius:10px;font:14px monospace}
#cpLicenseGate textarea{min-height:115px;resize:vertical}
#cpLicenseGate button{background:#155fc8;border:0;border-radius:10px;color:white;padding:12px 15px;
 font-weight:700;margin:8px 8px 2px 0;cursor:pointer}
#cpLicenseGate .cp-secondary{background:#e4edf9;color:#18457f}
#cpLicenseMessage{min-height:24px;font-size:13px;color:#a13e27}
</style><script>document.documentElement.classList.add('cp-license-pending')</script></head>""",1)
s = s.replace("</body>", """<section id="cpLicenseGate" role="dialog" aria-modal="true" aria-label="Kích hoạt ChấmPro">
<div class="cp-license-card"><h1>ChấmPro Test v14</h1>
<p><strong>Kích hoạt một lần — chấm bài hoàn toàn offline.</strong> Giữ nguyên tốc độ camera, đáp án và dữ liệu trên thiết bị.</p>
<label for="cpLicenseDevice">1. Mã thiết bị này</label>
<input id="cpLicenseDevice" readonly><button type="button" class="cp-secondary" id="cpLicenseCopy">Sao chép mã thiết bị</button>
<label>2. Đăng nhập mrhien.com và tạo giấy phép</label>
<button type="button" id="cpLicenseSite">Mở trang đăng nhập / kích hoạt</button>
<p>Trang kích hoạt: <b>mrhien.com/champro-activate/</b>. Cần Internet khi kích hoạt lần đầu, không cần khi chấm bài.</p>
<label for="cpLicenseCode">3. Dán giấy phép đã nhận</label>
<textarea id="cpLicenseCode" placeholder="Dán toàn bộ mã giấy phép vào đây" spellcheck="false"></textarea>
<button type="button" id="cpLicenseActivate">Kích hoạt ứng dụng</button>
<p id="cpLicenseMessage" role="status">Đang kiểm tra giấy phép lưu trên thiết bị…</p>
<small>Không gửi ảnh phiếu, họ tên hay điểm số lên máy chủ để chấm bài.</small>
</div></section><script type="module" src="./offline-license.mjs"></script></body>""",1)

html.write_text(s, encoding="utf-8")
# Ensure the bundled libraries needed for offline QR and Excel are present.
for filename in ["app.mjs", "advanced.mjs", "qr-compatible.mjs",
                 "compact-answer-ui.mjs", "compact-points.mjs",
                 "vendor/jsQR.js", "vendor/xlsx.full.min.js",
                 "layouts.json", "sheet-photo-store.mjs"]:
    assert (root / filename).is_file(), filename
print("PASS: offline preview bundle is complete")
