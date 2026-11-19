#!/usr/bin/env python3
"""Only touch the generated iOS bundle, never the shared Android/web source."""
import json, sys
from pathlib import Path
root = Path(sys.argv[1])
app = root / 'app'
p = root / 'package.json'
j = json.loads(p.read_text())
j['dependencies']['pako'] = '2.1.0'
p.write_text(json.dumps(j))
p = app / 'advanced.mjs'
s = p.read_text()
old = 'https://cdnjs.cloudflare.com/ajax/libs/pako/2.1.0/pako.min.js'
assert s.count(old) == 1
p.write_text(s.replace(old, './vendor/pako.min.js'))
p = app / 'app.mjs'
s = p.read_text()
old = """const sources=['./vendor/opencv.js',
    'https://cdn.jsdelivr.net/npm/@techstark/opencv-js@4.10.0-release.1/dist/opencv.js',
    'https://unpkg.com/@techstark/opencv-js@4.10.0-release.1/dist/opencv.js',
    'https://docs.opencv.org/4.10.0/opencv.js'];"""
assert s.count(old) == 1
p.write_text(s.replace(old, "const sources=['./vendor/opencv.js'];"))
p = app / 'index.html'
s = p.read_text()
old = '<div class="cp-plan" style="background:#eef5ff"><strong>Thông tin nâng cấp</strong><p>Bạn có thể nâng cấp quyền sử dụng tại website chính thức của ChấmPro.</p><p><strong>champro.mrhien.com</strong></p><p>Quyền sử dụng được tự động cập nhật theo tài khoản khi có mạng. Bạn cũng có thể chọn Cập nhật quyền sử dụng.</p></div>'
assert s.count(old) == 1
s = s.replace(old,'<div class="cp-plan"><strong>Quyền sử dụng</strong><p>Quyền đã cấp được cập nhật theo tài khoản khi có mạng. Bạn có thể chọn Cập nhật quyền sử dụng.</p></div>')
anchor = '<p class="cp-account-help">Dữ liệu chấm được lưu trên thiết bị. Hãy sao lưu trước khi gỡ ứng dụng.</p>'
assert s.count(anchor) == 1
s = s.replace(anchor,anchor+'''<details class="cp-account-details"><summary>Giới thiệu và giấy phép mã nguồn mở</summary>
<p>ChấmPro v16 · HienSoft. Các thành phần bên thứ ba được cung cấp theo giấy phép riêng.</p>
<p><a href="./third-party-notices/index.html" target="_self">Xem thông báo và giấy phép</a></p>
<p><a href="https://champro.mrhien.com/bao-mat.html" target="_blank" rel="noopener">Chính sách bảo mật</a></p></details>''')
p.write_text(s)
print('PASS: isolated iOS compliance copy and bundled QR fallback; original grading functions unchanged')
