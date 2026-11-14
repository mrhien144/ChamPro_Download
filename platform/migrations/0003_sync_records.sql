-- ChấmPro cross-device sync. ADDITIVE ONLY: no changes to accounts/payments/results.
-- Must first be deployed to an isolated D1 database and backfilled/tested with synthetic data.
CREATE TABLE IF NOT EXISTS sync_records (
 account_id TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('exam','student','answer','result')),
 record_id TEXT NOT NULL,
 revision INTEGER NOT NULL CHECK(revision >= 1),
 payload_json TEXT NOT NULL,
 deleted_at TEXT,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(account_id, kind, record_id)
);
CREATE INDEX IF NOT EXISTS sync_records_account_updated
 ON sync_records(account_id,updated_at,kind,record_id);
CREATE TABLE IF NOT EXISTS sync_photos (
 account_id TEXT NOT NULL,
 result_id TEXT NOT NULL,
 object_key TEXT NOT NULL,
 sha256 TEXT NOT NULL,
 byte_size INTEGER NOT NULL CHECK(byte_size > 0 AND byte_size <= 2097152),
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(account_id,result_id)
);
