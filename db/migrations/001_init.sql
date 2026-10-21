-- S.N Spices: first schema

CREATE TABLE admins (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(80)  NOT NULL,
  email       VARCHAR(120) NOT NULL UNIQUE,
  password    VARCHAR(200) NOT NULL,
  role        VARCHAR(20)  NOT NULL DEFAULT 'ADMIN' CHECK (role IN ('ADMIN','STAFF')),
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE customers (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(80) NOT NULL,
  phone       VARCHAR(15) NOT NULL UNIQUE,
  email       VARCHAR(120),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE categories (
  id          SERIAL PRIMARY KEY,
  slug        VARCHAR(80)  NOT NULL UNIQUE,
  name_en     VARCHAR(80)  NOT NULL,
  name_gu     VARCHAR(80),
  name_hi     VARCHAR(80),
  subtitle    VARCHAR(120),
  tag         VARCHAR(40),
  image       TEXT,
  sort_order  INT     NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE products (
  id           SERIAL PRIMARY KEY,
  category_id  INT NOT NULL REFERENCES categories(id),
  slug         VARCHAR(120) NOT NULL UNIQUE,
  name_en      VARCHAR(120) NOT NULL,
  name_gu      VARCHAR(120),
  name_hi      VARCHAR(120),
  description  TEXT,
  highlight    VARCHAR(160),
  origin       VARCHAR(80),
  badge        VARCHAR(40),
  image        TEXT,
  is_featured  BOOLEAN NOT NULL DEFAULT false,
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_products_category ON products(category_id);

CREATE TABLE product_variants (
  id          SERIAL PRIMARY KEY,
  product_id  INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  pack_size   VARCHAR(30)   NOT NULL,
  grams       INT           NOT NULL DEFAULT 0,
  price       NUMERIC(10,2) NOT NULL CHECK (price > 0),
  mrp         NUMERIC(10,2) NOT NULL CHECK (mrp > 0),
  stock       INT           NOT NULL DEFAULT 100 CHECK (stock >= 0),
  is_active   BOOLEAN       NOT NULL DEFAULT true
);
CREATE INDEX idx_variants_product ON product_variants(product_id);

CREATE TABLE coupons (
  id          SERIAL PRIMARY KEY,
  code        VARCHAR(30)   NOT NULL UNIQUE,
  type        VARCHAR(10)   NOT NULL CHECK (type IN ('PERCENT','FLAT')),
  value       NUMERIC(10,2) NOT NULL,
  min_order   NUMERIC(10,2) NOT NULL DEFAULT 0,
  max_off     NUMERIC(10,2),
  valid_till  TIMESTAMPTZ,
  is_active   BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE orders (
  id              SERIAL PRIMARY KEY,
  order_no        VARCHAR(30)  NOT NULL UNIQUE,
  customer_id     INT          NOT NULL REFERENCES customers(id),
  name            VARCHAR(80)  NOT NULL,
  phone           VARCHAR(15)  NOT NULL,
  address         VARCHAR(300) NOT NULL,
  city            VARCHAR(60)  NOT NULL,
  pincode         VARCHAR(6)   NOT NULL,
  note            VARCHAR(300),
  subtotal        NUMERIC(10,2) NOT NULL,
  discount        NUMERIC(10,2) NOT NULL DEFAULT 0,
  delivery_fee    NUMERIC(10,2) NOT NULL DEFAULT 0,
  total           NUMERIC(10,2) NOT NULL,
  coupon_id       INT REFERENCES coupons(id),
  payment_method  VARCHAR(20) NOT NULL CHECK (payment_method IN ('COD','WHATSAPP','ONLINE')),
  payment_status  VARCHAR(20) NOT NULL DEFAULT 'UNPAID' CHECK (payment_status IN ('UNPAID','PAID','REFUNDED')),
  status          VARCHAR(20) NOT NULL DEFAULT 'PENDING'
                  CHECK (status IN ('PENDING','CONFIRMED','PACKED','OUT_FOR_DELIVERY','DELIVERED','CANCELLED')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_orders_phone ON orders(phone);
CREATE INDEX idx_orders_status ON orders(status);

CREATE TABLE order_items (
  id          SERIAL PRIMARY KEY,
  order_id    INT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  variant_id  INT NOT NULL REFERENCES product_variants(id),
  name        VARCHAR(120)  NOT NULL,
  pack_size   VARCHAR(30)   NOT NULL,
  price       NUMERIC(10,2) NOT NULL,
  qty         INT           NOT NULL CHECK (qty > 0),
  line_total  NUMERIC(10,2) NOT NULL
);
CREATE INDEX idx_items_order ON order_items(order_id);

CREATE TABLE b2b_inquiries (
  id             SERIAL PRIMARY KEY,
  business_name  VARCHAR(120) NOT NULL,
  phone          VARCHAR(15)  NOT NULL,
  product        VARCHAR(120) NOT NULL,
  monthly_qty    VARCHAR(60)  NOT NULL,
  city_pincode   VARCHAR(120) NOT NULL,
  status         VARCHAR(20)  NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW','CONTACTED','CLOSED')),
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);
