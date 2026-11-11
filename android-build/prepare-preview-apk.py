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
html.write_text(s, encoding="utf-8")
# Ensure the bundled libraries needed for offline QR and Excel are present.
for filename in ["app.mjs", "advanced.mjs", "qr-compatible.mjs",
                 "compact-answer-ui.mjs", "compact-points.mjs",
                 "vendor/jsQR.js", "vendor/xlsx.full.min.js",
                 "layouts.json", "sheet-photo-store.mjs"]:
    assert (root / filename).is_file(), filename
print("PASS: offline preview bundle is complete")
