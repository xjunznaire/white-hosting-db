-- Database-backed digital inventory and automatic fulfillment.
ALTER TABLE orders ADD COLUMN delivery_status TEXT NOT NULL DEFAULT 'not_required';
CREATE TABLE IF NOT EXISTS delivery_items (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  payload TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'available' CHECK(status IN ('available','reserved','delivered')),
  order_id TEXT REFERENCES orders(id),
  reserved_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  delivered_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_delivery_available ON delivery_items(product_id,status,created_at);
CREATE INDEX IF NOT EXISTS idx_delivery_order ON delivery_items(order_id);
