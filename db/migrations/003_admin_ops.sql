-- Admin panel: SKUs, cost, stock log, order timeline, courier, store settings.

-- Pack level
ALTER TABLE product_variants
  ADD COLUMN sku                 VARCHAR(40),
  ADD COLUMN cost_price          NUMERIC(10,2),
  ADD COLUMN low_stock_threshold INT NOT NULL DEFAULT 10 CHECK (low_stock_threshold >= 0),
  ADD COLUMN updated_at          TIMESTAMPTZ NOT NULL DEFAULT now();

-- SKU for existing packs: SN-<product id>-<pack>, e.g. SN-001-250G
UPDATE product_variants v
SET sku = 'SN-' || LPAD(v.product_id::text, 3, '0') || '-' || UPPER(REGEXP_REPLACE(v.pack_size, '[^A-Za-z0-9]', '', 'g'))
WHERE sku IS NULL;
CREATE UNIQUE INDEX uq_variants_sku ON product_variants(sku) WHERE sku IS NOT NULL;

-- Product level
ALTER TABLE products
  ADD COLUMN images   JSONB NOT NULL DEFAULT '[]'::jsonb,  -- extra photos (URLs)
  ADD COLUMN hsn_code VARCHAR(12),
  ADD COLUMN gst_rate NUMERIC(4,2);                        -- e.g. 5.00 (prices include GST)

-- Every stock change is logged here
CREATE TABLE stock_movements (
  id             SERIAL PRIMARY KEY,
  variant_id     INT NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  change         INT NOT NULL,
  balance_after  INT NOT NULL,
  type           VARCHAR(12) NOT NULL CHECK (type IN ('INWARD','DEDUCT','SET','ORDER','CANCEL','EDIT')),
  note           VARCHAR(200),
  order_id       INT REFERENCES orders(id) ON DELETE SET NULL,
  admin_id       INT REFERENCES admins(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_moves_variant ON stock_movements(variant_id, created_at DESC);
CREATE INDEX idx_moves_time ON stock_movements(created_at DESC);

-- Order delivery info + timeline
ALTER TABLE orders
  ADD COLUMN courier     VARCHAR(60),
  ADD COLUMN tracking_no VARCHAR(60);

CREATE TABLE order_events (
  id          SERIAL PRIMARY KEY,
  order_id    INT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  kind        VARCHAR(12) NOT NULL CHECK (kind IN ('STATUS','PAYMENT','NOTE','SHIPPING')),
  status      VARCHAR(20),
  message     VARCHAR(500),
  admin_id    INT REFERENCES admins(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_events_order ON order_events(order_id, created_at);

-- Timeline row for orders placed before this migration
INSERT INTO order_events (order_id, kind, status, message, created_at)
SELECT id, 'STATUS', 'PENDING', 'Order placed on website', created_at FROM orders;

-- Customer notes + email already exist; add a short admin note
ALTER TABLE customers ADD COLUMN note VARCHAR(300);

-- Store settings (key/value). Env values are only used when a key is missing.
CREATE TABLE store_settings (
  key    VARCHAR(40) PRIMARY KEY,
  value  TEXT NOT NULL
);
