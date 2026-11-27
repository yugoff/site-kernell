ALTER TABLE payments ADD COLUMN provider_request_key TEXT;

CREATE TABLE worker_leases (
  name TEXT PRIMARY KEY,
  holder TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX worker_leases_expires ON worker_leases(expires_at);
CREATE INDEX rate_limits_resets ON rate_limits(resets);
CREATE INDEX sessions_expires ON sessions(expires);
CREATE INDEX subscriptions_grace ON subscriptions(status, grace_until);
CREATE INDEX services_provider_resource ON services(kind, tw_resource_id);
