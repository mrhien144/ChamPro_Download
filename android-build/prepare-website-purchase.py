#!/usr/bin/env python3
"""Apply website-only QR upgrade UI after the unchanged Android preparation."""
from pathlib import Path
import sys
root=Path(sys.argv[1])
html=root/'index.html'
s=html.read_text(encoding='utf-8')
def replace(old,new):
    global s
    assert s.count(old)==1, old
    s=s.replace(old,new,1)
replace('<summary>Thông tin gói sử dụng</summary>','<summary>Mua gói / Nâng cấp</summary>')
replace('ChấmPro trên Google Play hỗ trợ sử dụng quyền đã được cấp cho tài khoản. Phiên bản này chưa hỗ trợ mua gói trực tiếp trong ứng dụng. Nếu quyền sử dụng đã thay đổi, chọn Cập nhật quyền sử dụng ở phía trên.','Thanh toán qua mrhien.com. Đăng nhập đúng tài khoản đang sử dụng. Chỉ chuyển khoản theo mã QR của đơn hàng. Sau thanh toán, quay lại ứng dụng và chọn Cập nhật quyền sử dụng.')
replace('Quyền sử dụng theo thời hạn được máy chủ xác nhận.</p></div>','Quyền sử dụng theo thời hạn được máy chủ xác nhận.</p><button id="cpBuyAnnual" type="button">Mua / Gia hạn gói 1 năm</button></div>')
replace('Quyền sử dụng theo giấy phép đã cấp cho tài khoản.</p></div>','Quyền sử dụng theo giấy phép đã cấp cho tài khoản.</p><button id="cpBuyLifetime" type="button">Nâng cấp gói trọn đời</button></div>')
replace('<script type="module" src="./account-direct.mjs"></script>','<script type="module" src="./account-direct.mjs"></script><script type="module" src="./website-purchase.mjs"></script>')
replace('ChấmPro v15.0.1. Cập nhật phiên bản qua Google Play.','ChấmPro v15.0.2. Bản APK tải từ website.')
assert (root/'website-purchase.mjs').is_file()
html.write_text(s,encoding='utf-8')
