"""D1 synchronization isolation/CAS regression. In-memory SQLite; no real records."""
import sqlite3
from pathlib import Path
db=sqlite3.connect(':memory:')
db.row_factory=sqlite3.Row
db.executescript(Path(__file__).resolve().parents[1].joinpath('migrations/0003_sync_records.sql').read_text())
sql=(
 "INSERT INTO sync_records(account_id,kind,record_id,revision,payload_json,deleted_at) "
 "SELECT ?,?,?,?,?,? WHERE (?=0 OR EXISTS(SELECT 1 FROM sync_records WHERE account_id=? AND kind=? AND record_id=?)) "
 "ON CONFLICT(account_id,kind,record_id) DO UPDATE SET "
 "revision=excluded.revision,payload_json=excluded.payload_json,deleted_at=excluded.deleted_at,updated_at=CURRENT_TIMESTAMP "
 "WHERE sync_records.revision=?"
)
def put(account,rev,value,kind='result',record='r1'):
 args=(account,kind,record,rev+1,value,None,rev,account,kind,record,rev)
 result=db.execute(sql,args)
 return result.rowcount
def get(account):
 row=db.execute("SELECT revision,payload_json FROM sync_records WHERE account_id=? AND kind='result' AND record_id='r1'",(account,)).fetchone()
 return (row['revision'],row['payload_json']) if row else None
assert put('wp:8',0,'{"score":8}')==1
assert get('wp:8')==(1,'{"score":8}')
assert put('wp:8',0,'{"score":0}')==0, 'stale client must not overwrite'
assert put('wp:9',0,'{"score":6}')==1, 'another account may independently own same id'
assert put('wp:8',1,'{"score":9}')==1
assert put('wp:9',1,'{"score":7}')==1
assert get('wp:8')==(2,'{"score":9}') and get('wp:9')==(2,'{"score":7}')
assert put('wp:10',1,'{"score":1}')==0, 'missing row cannot start at revision 2'
assert get('wp:10') is None
assert put('wp:8',1,'{"score":5}')==0
assert get('wp:8')==(2,'{"score":9}')
assert db.execute('SELECT COUNT(*) FROM sync_records').fetchone()[0]==2
print('PASS: D1 migrations, per-account isolation, CAS revision, no stale overwrite, no forged initial revision')
