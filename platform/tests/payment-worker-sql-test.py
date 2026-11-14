#!/usr/bin/env python3
"""Contract tests for ChấmPro D1 payment statements, on an in-memory SQLite DB."""
from pathlib import Path
import re
import sqlite3

root=Path(__file__).resolve().parents[1]
src=(root/'worker/src/index.js').read_text(encoding='utf8')
schema=(root/'migrations/0001_init.sql').read_text(encoding='utf8') if (root/'migrations/0001_init.sql').exists() else (root.parent/'migrations/0001_init.sql').read_text(encoding='utf8')
assert "b.orderStatus!=='paid'" in src, "Must require verified gateway payment signal"
assert "Mã đơn hàng đã được sử dụng cho giao dịch khác" in src, "Must detect reused order IDs"
assert "if(!matches(saved)||!saved.processed_at)" in src, "Must reconcile persisted order before success"

def sql(prefix):
    pattern=r'env\.DB\.prepare\("('+re.escape(prefix)+r'.*?)"\)'
    m=re.search(pattern,src,re.DOTALL)
    if not m: raise AssertionError('Missing D1 SQL for '+prefix)
    return m.group(1)

insert=sql("INSERT OR IGNORE INTO payments ")
upgrade=sql("UPDATE accounts SET plan=CASE ")
mark=sql("UPDATE payments SET processed_at=CURRENT_TIMESTAMP ")
db=sqlite3.connect(':memory:')
db.row_factory=sqlite3.Row
db.executescript(schema)
db.execute("INSERT INTO accounts (id,wp_user_id,email,display_name) VALUES ('wp:7',7,'7@example.test','Test 7')")
db.execute("INSERT INTO accounts (id,wp_user_id,email,display_name) VALUES ('wp:8',8,'8@example.test','Test 8')")

def process(order, uid, product, plan, amount):
    aid='wp:'+str(uid)
    old=db.execute('SELECT * FROM payments WHERE order_id=?',(order,)).fetchone()
    matches=lambda o:o and o['wp_user_id']==uid and o['account_id']==aid and o['product_id']==product and o['plan']==plan and o['amount_vnd']==amount and o['status']=='completed'
    if old and not matches(old):return 'conflict'
    if old and old['processed_at']:return 'duplicate'
    with db:
        db.execute(insert,(order,uid,aid,product,plan,amount))
        db.execute(upgrade,(plan,plan,aid,order,aid,plan,amount))
        db.execute(mark,(order,aid))
    saved=db.execute('SELECT * FROM payments WHERE order_id=?',(order,)).fetchone()
    return 'created' if matches(saved) and saved['processed_at'] else 'conflict'

assert process(501,7,8919,'annual',99000)=='created'
first=db.execute("SELECT plan,expires_at FROM accounts WHERE id='wp:7'").fetchone()
assert first['plan']=='annual' and first['expires_at']
assert process(501,7,8919,'annual',99000)=='duplicate'
second=db.execute("SELECT plan,expires_at FROM accounts WHERE id='wp:7'").fetchone()
assert dict(first)==dict(second), 'Duplicate event must not extend expiry'
assert process(501,8,8920,'lifetime',299000)=='conflict'
assert db.execute("SELECT plan FROM accounts WHERE id='wp:8'").fetchone()[0]=='free'
assert process(502,7,8920,'lifetime',299000)=='created'
assert db.execute("SELECT plan,expires_at FROM accounts WHERE id='wp:7'").fetchone()['plan']=='lifetime'
assert process(503,7,8919,'annual',99000)=='created'
row=db.execute("SELECT plan,expires_at FROM accounts WHERE id='wp:7'").fetchone()
assert row['plan']=='lifetime' and row['expires_at'] is None, 'Annual renewal cannot downgrade lifetime'
assert db.execute("SELECT COUNT(*) FROM payments").fetchone()[0]==3
print('PASS: SQLite D1 payment tests: first payment, duplicate, reused ID, annual, lifetime, no downgrade')
