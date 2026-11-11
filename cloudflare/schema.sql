-- ChamPro cloud storage proposal (NOT deployed).
-- D1 stores metadata only. Full-size scanned photos belong in private R2.
-- Authentication must be enforced by a Worker; never expose this D1 binding
-- or R2 credentials directly to the browser.
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS cp_users (
  id TEXT PRIMARY KEY,
  auth_subject TEXT NOT NULL UNIQUE,
  display_name TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS cp_devices (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES cp_users(id) ON DELETE CASCADE,
  label TEXT,
  last_seen_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS cp_records (
  user_id TEXT NOT NULL REFERENCES cp_users(id) ON DELETE CASCADE,
  record_type TEXT NOT NULL CHECK(record_type IN ('exam','student','result','settings')),
  record_id TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  payload TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  PRIMARY KEY(user_id,record_type,record_id)
);
CREATE INDEX IF NOT EXISTS cp_records_updated ON cp_records(user_id,updated_at);
CREATE TABLE IF NOT EXISTS cp_sheet_photos (
  user_id TEXT NOT NULL REFERENCES cp_users(id) ON DELETE CASCADE,
  result_id TEXT NOT NULL,
  object_key TEXT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT 'image/jpeg',
  size_bytes INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT,
  PRIMARY KEY(user_id,result_id)
);
CREATE INDEX IF NOT EXISTS cp_sheet_photos_created ON cp_sheet_photos(user_id,created_at);
CREATE TABLE IF NOT EXISTS cp_sync_receipts (
  user_id TEXT NOT NULL REFERENCES cp_users(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  completed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(user_id,device_id,operation_id)
);
