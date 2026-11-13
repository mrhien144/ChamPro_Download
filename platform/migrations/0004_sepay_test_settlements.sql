-- Only SePay Test Mode claims, intentionally isolated from live receipts.
-- A transaction may settle only one order and vice versa.
CREATE TABLE IF NOT EXISTS sepay_test_settlements (
  order_id INTEGER PRIMARY KEY,
  transaction_id INTEGER NOT NULL UNIQUE REFERENCES sepay_test_receipts(transaction_id),
  wp_user_id INTEGER NOT NULL,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  product_id INTEGER NOT NULL,
  plan TEXT NOT NULL CHECK(plan IN ('annual', 'lifetime')),
  amount_vnd INTEGER NOT NULL,
  processed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS sepay_test_settlements_account ON sepay_test_settlements(account_id);
