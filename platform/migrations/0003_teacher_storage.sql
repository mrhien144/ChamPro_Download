-- ChấmPro staging migration 0003: teacher data & private photo metadata.
-- Additive only. Existing accounts, payments, credits, usage and audit are untouched.
-- No student data is uploaded automatically by this migration.
-- All queries must be authorized by the server using the WordPress account_id.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS cp_devices (
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT,
  PRIMARY KEY (account_id, device_id)
);

CREATE TABLE IF NOT EXISTS cp_records (
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  record_type TEXT NOT NULL CHECK(record_type IN ('exam','student','result','settings')),
  record_id TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>=1),
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT,
  PRIMARY KEY (account_id, record_type, record_id)
);
CREATE INDEX IF NOT EXISTS cp_records_modified ON cp_records(account_id,updated_at);

CREATE TABLE IF NOT EXISTS cp_photo_objects (
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  result_id TEXT NOT NULL,
  r2_object_key TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL DEFAULT 'image/jpeg',
  size_bytes INTEGER NOT NULL CHECK(size_bytes>=0),
  sha256 TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT,
  PRIMARY KEY (account_id, result_id)
);
CREATE INDEX IF NOT EXISTS cp_photo_objects_created ON cp_photo_objects(account_id,created_at);

CREATE TABLE IF NOT EXISTS cp_sync_receipts (
  account_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (account_id,device_id,operation_id),
  FOREIGN KEY (account_id,device_id) REFERENCES cp_devices(account_id,device_id) ON DELETE CASCADE
);
