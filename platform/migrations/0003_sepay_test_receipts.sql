-- Isolated SePay Test Mode webhook receipts; no direct grants or WooCommerce updates.
CREATE TABLE IF NOT EXISTS sepay_test_receipts (
  transaction_id INTEGER PRIMARY KEY,
  payment_code TEXT NOT NULL,
  amount_vnd INTEGER NOT NULL CHECK(amount_vnd > 0),
  account_number TEXT NOT NULL,
  payload_sha256 TEXT NOT NULL,
  signature_timestamp INTEGER NOT NULL,
  received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS sepay_test_receipts_code ON sepay_test_receipts(payment_code);
