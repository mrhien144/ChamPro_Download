-- ChấmPro staging v0.2: admin-granted extra free credits.
-- Execute ONCE in Cloudflare D1 Studio. Never reset usage or change plan.
CREATE TABLE IF NOT EXISTS bonus_credits (
  id TEXT PRIMARY KEY,
  grant_request_id TEXT NOT NULL,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  feature TEXT NOT NULL CHECK(feature IN ('scan','mix','qr')),
  amount INTEGER NOT NULL CHECK(amount BETWEEN 1 AND 10000),
  actor TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(grant_request_id, account_id, feature)
);
CREATE INDEX IF NOT EXISTS bonus_credits_account_feature
ON bonus_credits(account_id, feature);
CREATE INDEX IF NOT EXISTS bonus_credits_request
ON bonus_credits(grant_request_id);
