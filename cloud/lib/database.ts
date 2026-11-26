import "server-only";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync, chmodSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type {
  Account,
  Activity,
  DomainPersonSummary,
  LedgerEntry,
  Order,
  PaymentSummary,
  Service,
  SshKeySummary,
  User,
} from "./catalog";
import { decryptJson, encryptJson } from "./crypto";

const DEFAULT_PRICING_CATEGORIES = [
  "domains",
  "vps",
  "dedicated",
  "databases",
  "s3",
  "k8s",
  "balancers",
  "floating_ips",
  "cdn",
  "apps",
  "registries",
  "routers",
  "network_drives",
  "ai",
] as const;

function ensureColumn(
  sql: DatabaseSync,
  table: string,
  column: string,
  definition: string,
) {
  const columns = sql.prepare(`PRAGMA table_info(${table})`).all() as Array<{
    name: string;
  }>;
  if (!columns.some((item) => item.name === column)) {
    sql.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function defaultMarkupPercent(): number {
  const raw = Number(process.env.CLOUD_DEFAULT_MARKUP_PERCENT);
  if (Number.isFinite(raw) && raw >= 0 && raw <= 500) return raw;
  return 20;
}

let database: DatabaseSync | undefined;
export function db() {
  if (database) return database;
  const filename =
    process.env.CLOUD_DATABASE_PATH ||
    path.join(process.cwd(), ".data", "cloud.sqlite");
  mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
  database = new DatabaseSync(filename);
  chmodSync(filename, 0o600);
  database.exec(`
    PRAGMA journal_mode=WAL;
    PRAGMA foreign_keys=ON;
    PRAGMA busy_timeout=5000;
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
  `);

  ensureColumn(database, "users", "email_verified_at", "INTEGER");
  ensureColumn(database, "users", "tw_project_id", "INTEGER");
  ensureColumn(database, "services", "tw_resource_id", "TEXT");
  ensureColumn(database, "services", "tw_project_id", "INTEGER");
  ensureColumn(database, "services", "cost_price", "INTEGER");
  ensureColumn(database, "services", "metadata_json", "TEXT");
  ensureColumn(database, "orders", "kind", "TEXT");
  ensureColumn(database, "orders", "cost_amount", "INTEGER");
  ensureColumn(database, "orders", "retail_amount", "INTEGER");
  ensureColumn(database, "orders", "provider_payload", "TEXT");
  ensureColumn(database, "orders", "updated_at", "TEXT");
  ensureColumn(database, "payments", "request_key", "TEXT");
  database.exec(
    "CREATE UNIQUE INDEX IF NOT EXISTS payments_user_req ON payments(user_id, request_key) WHERE request_key IS NOT NULL",
  );

  const seedRule = database.prepare(
    "INSERT OR IGNORE INTO pricing_rules (id,category,provider_key,markup_percent,fixed_retail_price,min_margin_rub,enabled,updated_at) VALUES (?,?, '', ?, NULL, 0, 1, ?)",
  );
  const now = Date.now();
  const markup = defaultMarkupPercent();
  for (const category of DEFAULT_PRICING_CATEGORIES) {
    seedRule.run(`default:${category}`, category, markup, now);
  }

  return database;
}

export function transaction<T>(run: () => T): T {
  const sql = db();
  sql.exec("BEGIN IMMEDIATE");
  try {
    const result = run();
    sql.exec("COMMIT");
    return result;
  } catch (error) {
    sql.exec("ROLLBACK");
    throw error;
  }
}

export function logActivity(userId: string, title: string) {
  db()
    .prepare("INSERT INTO activity (user_id,title,created) VALUES (?,?,?)")
    .run(userId, title, new Date().toISOString());
}

export function logAudit(
  userId: string | null,
  action: string,
  targetType?: string,
  targetId?: string,
  meta?: Record<string, unknown>,
) {
  db()
    .prepare(
      "INSERT INTO audit_logs (user_id,action,target_type,target_id,meta_json,created_at) VALUES (?,?,?,?,?,?)",
    )
    .run(
      userId,
      action,
      targetType ?? null,
      targetId ?? null,
      meta ? JSON.stringify(meta) : null,
      new Date().toISOString(),
    );
}

export function ledgerBalanceKopecks(userId: string): number {
  const row = db()
    .prepare(
      "SELECT COALESCE(SUM(CASE WHEN direction='credit' THEN amount_kopecks ELSE -amount_kopecks END), 0) AS balance_kopecks FROM ledger_entries WHERE user_id=?",
    )
    .get(userId) as { balance_kopecks: number };
  return row?.balance_kopecks ?? 0;
}

export function ledgerBalanceRub(userId: string): number {
  return Math.round(ledgerBalanceKopecks(userId) / 100);
}

export function listLedgerEntries(userId: string, limit = 30): LedgerEntry[] {
  return db()
    .prepare(
      "SELECT id,direction,amount_kopecks,kind,note,created_at AS createdAt FROM ledger_entries WHERE user_id=? ORDER BY created_at DESC LIMIT ?",
    )
    .all(userId, limit)
    .map((row) => {
      const r = row as {
        id: string;
        direction: "credit" | "debit";
        amount_kopecks: number;
        kind: string;
        note: string | null;
        createdAt: string;
      };
      return {
        id: r.id,
        direction: r.direction,
        amountRub: Math.round(r.amount_kopecks / 100),
        kind: r.kind,
        note: r.note,
        createdAt: r.createdAt,
      };
    });
}

export function listPaymentsForUser(
  userId: string,
  limit = 20,
): PaymentSummary[] {
  return db()
    .prepare(
      "SELECT id,provider,external_id AS externalId,amount_kopecks,status,receipt_url AS receiptUrl,created_at AS createdAt FROM payments WHERE user_id=? ORDER BY created_at DESC LIMIT ?",
    )
    .all(userId, limit)
    .map((row) => {
      const r = row as {
        id: string;
        provider: string;
        externalId: string | null;
        amount_kopecks: number;
        status: string;
        receiptUrl: string | null;
        createdAt: string;
      };
      return {
        id: r.id,
        provider: r.provider,
        externalId: r.externalId,
        amountRub: Math.round(r.amount_kopecks / 100),
        status: r.status,
        receiptUrl: r.receiptUrl,
        createdAt: r.createdAt,
      };
    });
}

export function listDomainPersonsForUser(userId: string): DomainPersonSummary[] {
  return db()
    .prepare(
      "SELECT id,type,label,summary,tw_person_id AS twPersonId,created_at AS createdAt FROM domain_persons WHERE user_id=? ORDER BY created_at DESC",
    )
    .all(userId)
    .map((row) => ({ ...row })) as unknown as DomainPersonSummary[];
}

export function listSshKeysForUser(userId: string): SshKeySummary[] {
  return db()
    .prepare(
      "SELECT id,name,fingerprint,tw_ssh_key_id AS twSshKeyId,created_at AS createdAt FROM ssh_keys WHERE user_id=? ORDER BY created_at DESC",
    )
    .all(userId)
    .map((row) => ({ ...row })) as unknown as SshKeySummary[];
}

export type StoredServiceCredentials = {
  rootPass?: string | null;
  vncPass?: string | null;
  dbLogin?: string | null;
  dbPassword?: string | null;
  dbHost?: string | null;
  dbPort?: number | null;
  s3AccessKey?: string | null;
  s3SecretKey?: string | null;
  s3Hostname?: string | null;
  kubeconfig?: string | null;
};

export function saveServiceCredentials(
  serviceId: string,
  userId: string,
  payload: StoredServiceCredentials,
) {
  const { ciphertext, keyVersion } = encryptJson(payload);
  db()
    .prepare(
      "INSERT INTO service_credentials (service_id,user_id,encrypted_payload,key_version,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(service_id) DO UPDATE SET encrypted_payload=excluded.encrypted_payload,key_version=excluded.key_version,updated_at=excluded.updated_at",
    )
    .run(serviceId, userId, ciphertext, keyVersion, Date.now());
}

export function readServiceCredentials(
  serviceId: string,
  userId: string,
): StoredServiceCredentials | null {
  const row = db()
    .prepare(
      "SELECT encrypted_payload FROM service_credentials WHERE service_id=? AND user_id=?",
    )
    .get(serviceId, userId) as { encrypted_payload: string } | undefined;
  if (!row) return null;
  return decryptJson<StoredServiceCredentials>(row.encrypted_payload);
}

function parsePlainMetadata(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? { ...(parsed as Record<string, unknown>) }
      : null;
  } catch {
    return null;
  }
}

export function accountFor(user: User): Account {
  const sql = db();
  const services = sql
    .prepare(
      "SELECT id,kind,name,status,price,renewal,details,address,auto_renew AS autoRenew,tw_resource_id AS twResourceId,metadata_json AS metadataJson FROM services WHERE user_id=? ORDER BY kind DESC,name",
    )
    .all(user.id) as unknown as Array<
    Omit<Service, "autoRenew" | "metadata"> & {
      autoRenew: number;
      metadataJson: string | null;
    }
  >;
  const credentialRows = user.demo
    ? []
    : (sql
        .prepare("SELECT service_id FROM service_credentials WHERE user_id=?")
        .all(user.id) as Array<{ service_id: string }>);
  const credSet = new Set(credentialRows.map((row) => row.service_id));
  const yookassaEnabled = Boolean(
    process.env.YOOKASSA_SHOP_ID?.trim() &&
      process.env.YOOKASSA_SECRET_KEY?.trim(),
  );
  const timewebEnabled = Boolean(process.env.TIMEWEB_TOKEN?.trim());
  return {
    user,
    services: services.map(({ metadataJson, ...service }) => ({
      ...service,
      autoRenew: Boolean(service.autoRenew),
      hasCredentials: credSet.has(service.id),
      metadata: parsePlainMetadata(metadataJson),
    })),
    // node:sqlite returns null-prototype rows. RSC props require plain objects.
    orders: sql
      .prepare(
        "SELECT id,title,amount,created,status,kind FROM orders WHERE user_id=? ORDER BY created DESC LIMIT 100",
      )
      .all(user.id)
      .map((row) => ({ ...row })) as unknown as Order[],
    activity: sql
      .prepare(
        "SELECT id,title,created FROM activity WHERE user_id=? ORDER BY id DESC LIMIT 12",
      )
      .all(user.id)
      .map((row) => ({ ...row })) as unknown as Activity[],
    balance: user.demo ? 2480 : ledgerBalanceRub(user.id),
    domainPersons: user.demo ? [] : listDomainPersonsForUser(user.id),
    sshKeys: user.demo ? [] : listSshKeysForUser(user.id),
    ledger: user.demo ? [] : listLedgerEntries(user.id),
    payments: user.demo ? [] : listPaymentsForUser(user.id),
    yookassaEnabled,
    timewebEnabled,
  };
}

export function createDemo(): User {
  const id = randomUUID();
  const now = Date.now();
  const inDays = (days: number) =>
    new Date(now + days * 86400000).toISOString();
  return transaction(() => {
    db()
      .prepare("DELETE FROM users WHERE demo=1 AND created<?")
      .run(now - 86400000);
    db()
      .prepare(
        "INSERT INTO users (id,name,email,password,demo,created) VALUES (?,?,?,?,1,?)",
      )
      .run(id, "Александр", `demo-${id}@example.invalid`, "", now);
    const insert = db().prepare(
      "INSERT INTO services (id,user_id,kind,name,status,price,renewal,details,address) VALUES (?,?,?,?,?,?,?,?,?)",
    );
    insert.run(
      randomUUID(),
      id,
      "vps",
      "production-01",
      "running",
      890,
      inDays(12),
      "2 vCPU · 4 ГБ RAM · 50 ГБ NVMe|Москва|Ubuntu 24.04",
      "192.0.2.14",
    );
    insert.run(
      randomUUID(),
      id,
      "vps",
      "dev-sandbox",
      "stopped",
      490,
      inDays(24),
      "1 vCPU · 2 ГБ RAM · 25 ГБ NVMe|Санкт-Петербург|Debian 12",
      "192.0.2.28",
    );
    insert.run(
      randomUUID(),
      id,
      "domain",
      "your-project.ru",
      "active",
      690,
      inDays(58),
      "ns1.example.invalid|ns2.example.invalid",
      "",
    );
    insert.run(
      randomUUID(),
      id,
      "domain",
      "your-studio.com",
      "active",
      2690,
      inDays(185),
      "ns1.example.invalid|ns2.example.invalid",
      "",
    );
    db()
      .prepare(
        "INSERT INTO orders (id,user_id,title,amount,created,status,request_key) VALUES (?,?,?,?,?,?,?)",
      )
      .run(
        randomUUID(),
        id,
        "Сервер production-01 · Проект",
        890,
        new Date(now - 86400000 * 18).toISOString(),
        "demo",
        "seed",
      );
    logActivity(id, "Сервер production-01 запущен");
    logActivity(id, "Домен your-project.ru добавлен");
    return { id, name: "Александр", email: "demo@example.invalid", demo: true };
  });
}
