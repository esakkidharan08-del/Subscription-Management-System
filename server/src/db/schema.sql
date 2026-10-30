-- All money columns are integer paise. Tax rates are basis points (1800 = 18%).

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'staff', 'customer')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS password_resets (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'service',
  sales_price INTEGER NOT NULL CHECK (sales_price >= 0),
  cost_price INTEGER NOT NULL DEFAULT 0 CHECK (cost_price >= 0),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS product_variants (
  id INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  attribute TEXT NOT NULL,
  value TEXT NOT NULL,
  price_delta INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS plans (
  id INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id),
  name TEXT NOT NULL,
  price INTEGER NOT NULL CHECK (price >= 0),
  billing_period TEXT NOT NULL CHECK (billing_period IN ('daily', 'weekly', 'monthly', 'yearly')),
  min_quantity INTEGER NOT NULL DEFAULT 1 CHECK (min_quantity >= 1),
  available_from TEXT,
  available_to TEXT,
  end_behavior TEXT NOT NULL DEFAULT 'renewable'
    CHECK (end_behavior IN ('auto_close', 'manual_close', 'pausable', 'renewable'))
);

CREATE TABLE IF NOT EXISTS taxes (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  rate_bp INTEGER NOT NULL CHECK (rate_bp BETWEEN 0 AND 10000)
);

CREATE TABLE IF NOT EXISTS tax_rules (
  id INTEGER PRIMARY KEY,
  tax_id INTEGER NOT NULL REFERENCES taxes(id),
  product_id INTEGER REFERENCES products(id),
  product_type TEXT,
  priority INTEGER NOT NULL DEFAULT 0,
  CHECK (product_id IS NOT NULL OR product_type IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS quotation_templates (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  plan_id INTEGER NOT NULL REFERENCES plans(id),
  validity_days INTEGER NOT NULL DEFAULT 30 CHECK (validity_days > 0),
  lines TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id INTEGER PRIMARY KEY,
  number TEXT NOT NULL UNIQUE,
  customer_id INTEGER NOT NULL REFERENCES users(id),
  plan_id INTEGER NOT NULL REFERENCES plans(id),
  start_date TEXT NOT NULL,
  expiry_date TEXT,
  payment_terms INTEGER NOT NULL DEFAULT 15 CHECK (payment_terms >= 0),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'quotation', 'confirmed', 'active', 'closed')),
  next_billing_date TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (expiry_date IS NULL OR expiry_date > start_date)
);

CREATE TABLE IF NOT EXISTS subscription_lines (
  id INTEGER PRIMARY KEY,
  subscription_id INTEGER NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price INTEGER NOT NULL CHECK (unit_price >= 0),
  tax_id INTEGER REFERENCES taxes(id),
  amount INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS discounts (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('fixed', 'percent')),
  value INTEGER NOT NULL CHECK (value >= 0),
  min_amount INTEGER NOT NULL DEFAULT 0,
  min_quantity INTEGER NOT NULL DEFAULT 0,
  scope TEXT NOT NULL CHECK (scope IN ('product', 'subscription')),
  product_id INTEGER REFERENCES products(id),
  starts_at TEXT,
  ends_at TEXT,
  usage_limit INTEGER,
  times_used INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  CHECK (type <> 'percent' OR value <= 100)
);

CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY,
  number TEXT NOT NULL UNIQUE,
  subscription_id INTEGER NOT NULL REFERENCES subscriptions(id),
  customer_id INTEGER NOT NULL REFERENCES users(id),
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'confirmed', 'paid', 'cancelled')),
  subtotal INTEGER NOT NULL DEFAULT 0,
  tax_total INTEGER NOT NULL DEFAULT 0,
  discount_total INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  due_date TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (subscription_id, period_start)
);

CREATE TABLE IF NOT EXISTS invoice_lines (
  id INTEGER PRIMARY KEY,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id),
  description TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price INTEGER NOT NULL,
  tax_rate_bp INTEGER NOT NULL DEFAULT 0,
  amount INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id),
  method TEXT NOT NULL CHECK (method IN ('cash', 'bank_transfer', 'card', 'upi', 'other')),
  amount INTEGER NOT NULL CHECK (amount > 0),
  paid_on TEXT NOT NULL,
  note TEXT
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_billing ON subscriptions (status, next_billing_date);
CREATE INDEX IF NOT EXISTS idx_subscriptions_customer ON subscriptions (customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status_due ON invoices (status, due_date);
CREATE INDEX IF NOT EXISTS idx_invoices_subscription ON invoices (subscription_id);
CREATE INDEX IF NOT EXISTS idx_invoices_customer ON invoices (customer_id);
CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payments (invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_paid_on ON payments (paid_on);
