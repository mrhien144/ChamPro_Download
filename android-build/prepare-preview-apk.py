#!/usr/bin/env python3
"""Prepare isolated, fully bundled ChấmPro preview for Android WebView."""
from pathlib import Path
import sys

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
# This app is already bundled in the APK. Never register a browser service worker
# that could pin an obsolete web layout or delay the native presentation.
s = s.replace('<script type="module" src="./pwa-install.mjs?v=20261111-pwa-preview-v2"></script>', '')
html.write_text(s, encoding="utf-8")
# Ensure the bundled libraries needed for offline QR and Excel are present.
for filename in ["app.mjs", "advanced.mjs", "qr-compatible.mjs",
                 "vendor/jsQR.js", "vendor/xlsx.full.min.js",
                 "layouts.json", "sheet-photo-store.mjs"]:
    assert (root / filename).is_file(), filename
print("PASS: offline preview bundle is complete")
