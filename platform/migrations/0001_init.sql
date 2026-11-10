-- ChấmPro Platform v0.1: central accounts, entitlements and audit log.
-- DO NOT import old localStorage data into this database without per-user consent.
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  wp_user_id INTEGER NOT NULL UNIQUE,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  plan TEXT NOT NULL DEFAULT 'free' CHECK(plan IN ('free','annual','lifetime')),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended')),
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS accounts_email_lower ON accounts(lower(email));
CREATE INDEX IF NOT EXISTS accounts_plan_status ON accounts(plan,status);

-- Each successful output uses a unique request_id; duplicate retries cost 0.
CREATE TABLE IF NOT EXISTS usage_events (
  request_id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  feature TEXT NOT NULL CHECK(feature IN ('scan','mix','qr')),
  source TEXT NOT NULL DEFAULT 'web',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS usage_by_account_feature ON usage_events(account_id,feature);

CREATE TABLE IF NOT EXISTS payments (
  order_id INTEGER PRIMARY KEY,
  wp_user_id INTEGER NOT NULL,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  product_id INTEGER NOT NULL,
  plan TEXT NOT NULL CHECK(plan IN ('annual','lifetime')),
  amount_vnd INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  processed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS payments_by_account ON payments(account_id);

CREATE TABLE IF NOT EXISTS admin_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  account_id TEXT,
  details TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
