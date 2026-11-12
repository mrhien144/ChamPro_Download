-- APK v14 isolated device pairing; does not touch scan/grade/student tables.
CREATE TABLE IF NOT EXISTS device_pairings (
 id TEXT PRIMARY KEY,
 code TEXT NOT NULL UNIQUE,
 device_id TEXT NOT NULL,
 poll_hash TEXT NOT NULL,
 account_id TEXT,
 created_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL,
 approved_at INTEGER,
 claimed_at INTEGER,
 claimed_tag TEXT
);
CREATE INDEX IF NOT EXISTS idx_device_pairings_code ON device_pairings(code,expires_at);
CREATE INDEX IF NOT EXISTS idx_device_pairings_device ON device_pairings(device_id,created_at);
CREATE TABLE IF NOT EXISTS device_grants (
 device_id TEXT PRIMARY KEY,
 account_id TEXT NOT NULL REFERENCES accounts(id),
 refresh_hash TEXT NOT NULL UNIQUE,
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_device_grants_account ON device_grants(account_id);
