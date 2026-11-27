CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL, demo INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL,
  email_verified_at INTEGER, tw_project_id INTEGER
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS services (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL, name TEXT NOT NULL, status TEXT NOT NULL, price INTEGER NOT NULL,
  renewal TEXT NOT NULL, details TEXT NOT NULL, address TEXT NOT NULL, auto_renew INTEGER NOT NULL DEFAULT 1,
  tw_resource_id TEXT, tw_project_id INTEGER, cost_price INTEGER, metadata_json TEXT
);
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL, amount INTEGER NOT NULL, created TEXT NOT NULL, status TEXT NOT NULL,
  request_key TEXT NOT NULL, kind TEXT, cost_amount INTEGER, retail_amount INTEGER,
  provider_payload TEXT, updated_at TEXT, UNIQUE(user_id, request_key)
);
CREATE TABLE IF NOT EXISTS activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL, created TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, resets INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS provider_catalog_cache (
  category TEXT PRIMARY KEY,
  payload_json TEXT NOT NULL,
  fetched_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  source TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS pricing_rules (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  provider_key TEXT NOT NULL DEFAULT '',
  markup_percent REAL NOT NULL DEFAULT 20,
  fixed_retail_price INTEGER,
  min_margin_rub INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL,
  UNIQUE(category, provider_key)
);
CREATE TABLE IF NOT EXISTS user_email_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS domain_persons (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  label TEXT NOT NULL,
  summary TEXT NOT NULL,
  encrypted_payload TEXT NOT NULL,
  key_version INTEGER NOT NULL DEFAULT 1,
  tw_person_id INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS ledger_entries (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  direction TEXT NOT NULL,
  amount_kopecks INTEGER NOT NULL,
  kind TEXT NOT NULL,
  reference_type TEXT,
  reference_id TEXT,
  idempotency_key TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(user_id, idempotency_key)
);
CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  external_id TEXT,
  amount_kopecks INTEGER NOT NULL,
  status TEXT NOT NULL,
  receipt_url TEXT,
  request_key TEXT,
  payload_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  meta_json TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  service_id TEXT REFERENCES services(id) ON DELETE SET NULL,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  period TEXT NOT NULL,
  cost_kopecks INTEGER NOT NULL,
  retail_kopecks INTEGER NOT NULL,
  status TEXT NOT NULL,
  next_charge_at INTEGER NOT NULL,
  grace_until INTEGER,
  auto_renew INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS provisioning_jobs (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  next_run_at INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ssh_keys (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  public_key TEXT NOT NULL,
  tw_ssh_key_id INTEGER,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS service_credentials (
  service_id TEXT PRIMARY KEY REFERENCES services(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  encrypted_payload TEXT NOT NULL,
  key_version INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS services_user ON services(user_id);
CREATE INDEX IF NOT EXISTS orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS email_tokens_user ON user_email_tokens(user_id, kind);
CREATE INDEX IF NOT EXISTS domain_persons_user ON domain_persons(user_id);
CREATE INDEX IF NOT EXISTS ssh_keys_user ON ssh_keys(user_id);
CREATE INDEX IF NOT EXISTS ledger_user ON ledger_entries(user_id, created_at);
CREATE INDEX IF NOT EXISTS payments_user ON payments(user_id, created_at);
CREATE INDEX IF NOT EXISTS payments_external ON payments(provider, external_id);
CREATE INDEX IF NOT EXISTS subscriptions_due ON subscriptions(status, next_charge_at);
CREATE INDEX IF NOT EXISTS provisioning_due ON provisioning_jobs(status, next_run_at);
CREATE UNIQUE INDEX IF NOT EXISTS payments_user_req
  ON payments(user_id, request_key) WHERE request_key IS NOT NULL;
