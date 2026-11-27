import "server-only";
import { cloudSetting } from "./settings";
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
import { batch, db } from "./d1";
import { salesEnabled } from "./sales";

export { batch, db };

export function activityStatement(userId: string, title: string, onlyIfChanged = false) {
  return db()
    .prepare(`INSERT INTO activity (user_id,title,created) SELECT ?,?,?${onlyIfChanged ? " WHERE changes()>0" : ""}`)
    .bind(userId, title, new Date().toISOString());
}

export function auditStatement(
  userId: string | null,
  action: string,
  targetType?: string,
  targetId?: string,
  meta?: Record<string, unknown>,
  onlyIfChanged = false,
) {
  return db()
    .prepare(
      `INSERT INTO audit_logs (user_id,action,target_type,target_id,meta_json,created_at) SELECT ?,?,?,?,?,?${onlyIfChanged ? " WHERE changes()>0" : ""}`,
    )
    .bind(
      userId,
      action,
      targetType ?? null,
      targetId ?? null,
      meta ? JSON.stringify(meta) : null,
      new Date().toISOString(),
    );
}

export async function logActivity(userId: string, title: string) {
  await activityStatement(userId, title).run();
}

export async function logAudit(...args: Parameters<typeof auditStatement>) {
  await auditStatement(...args).run();
}

export const ledgerBalanceQuery =
  "SELECT COALESCE(SUM(CASE WHEN direction='credit' THEN amount_kopecks ELSE -amount_kopecks END),0) AS balance_kopecks FROM ledger_entries WHERE user_id=?";

export async function ledgerBalanceKopecks(userId: string): Promise<number> {
  const row = await db()
    .prepare(
      ledgerBalanceQuery,
    )
    .get(userId) as { balance_kopecks: number };
  return row?.balance_kopecks ?? 0;
}

export async function ledgerBalanceRub(userId: string): Promise<number> {
  return Math.round(await ledgerBalanceKopecks(userId) / 100);
}

const domainPersonsQuery =
  "SELECT id,type,label,summary,tw_person_id AS twPersonId,created_at AS createdAt FROM domain_persons WHERE user_id=? ORDER BY created_at DESC";
const sshKeysQuery =
  "SELECT id,name,fingerprint,tw_ssh_key_id AS twSshKeyId,created_at AS createdAt FROM ssh_keys WHERE user_id=? ORDER BY created_at DESC";
const ledgerEntriesQuery =
  "SELECT id,direction,amount_kopecks,kind,note,created_at AS createdAt FROM ledger_entries WHERE user_id=? ORDER BY created_at DESC LIMIT 30";
const paymentsQuery =
  "SELECT id,provider,external_id AS externalId,amount_kopecks,status,receipt_url AS receiptUrl,created_at AS createdAt FROM payments WHERE user_id=? ORDER BY created_at DESC LIMIT 20";

export async function listDomainPersonsForUser(userId: string): Promise<DomainPersonSummary[]> {
  return await db().prepare(domainPersonsQuery).all(userId) as unknown as DomainPersonSummary[];
}

export async function listSshKeysForUser(userId: string): Promise<SshKeySummary[]> {
  return await db().prepare(sshKeysQuery).all(userId) as unknown as SshKeySummary[];
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

export function serviceCredentialsStatement(
  serviceId: string,
  userId: string,
  payload: StoredServiceCredentials,
) {
  const { ciphertext, keyVersion } = encryptJson(payload);
  return db()
    .prepare(
      "INSERT INTO service_credentials (service_id,user_id,encrypted_payload,key_version,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(service_id) DO UPDATE SET encrypted_payload=excluded.encrypted_payload,key_version=excluded.key_version,updated_at=excluded.updated_at",
    )
    .bind(serviceId, userId, ciphertext, keyVersion, Date.now());
}

export async function saveServiceCredentials(
  serviceId: string,
  userId: string,
  payload: StoredServiceCredentials,
) {
  await serviceCredentialsStatement(serviceId, userId, payload).run();
}

export async function readServiceCredentials(
  serviceId: string,
  userId: string,
): Promise<StoredServiceCredentials | null> {
  const row = await db()
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

export async function accountFor(user: User): Promise<Account> {
  const sql = db();
  const [serviceRows, orders, activity, credentials, balance, persons, keys, ledger, payments] = await batch(
    sql.prepare(
      "SELECT id,kind,name,status,price,renewal,details,address,auto_renew AS autoRenew,tw_resource_id AS twResourceId,metadata_json AS metadataJson FROM services WHERE user_id=? ORDER BY kind DESC,name",
    ).bind(user.id),
    sql.prepare("SELECT id,title,amount,created,status,kind FROM orders WHERE user_id=? ORDER BY created DESC LIMIT 100")
      .bind(user.id),
    sql.prepare("SELECT id,title,created FROM activity WHERE user_id=? ORDER BY id DESC LIMIT 12")
      .bind(user.id),
    ...(user.demo ? [] : [
      sql.prepare("SELECT service_id FROM service_credentials WHERE user_id=?").bind(user.id),
      sql.prepare(ledgerBalanceQuery).bind(user.id),
      sql.prepare(domainPersonsQuery).bind(user.id),
      sql.prepare(sshKeysQuery).bind(user.id),
      sql.prepare(ledgerEntriesQuery).bind(user.id),
      sql.prepare(paymentsQuery).bind(user.id),
    ]),
  );
  const services = serviceRows.results as Array<
    Omit<Service, "autoRenew" | "metadata"> & { autoRenew: number; metadataJson: string | null }
  >;
  const credSet = new Set((credentials?.results as Array<{ service_id: string }> | undefined)
    ?.map((row) => row.service_id));
  const currentBalance = (balance?.results[0] as { balance_kopecks: number } | undefined)?.balance_kopecks ?? 0;
  const ledgerEntries = (ledger?.results ?? []) as Array<
    Omit<LedgerEntry, "amountRub"> & { amount_kopecks: number }
  >;
  const paymentEntries = (payments?.results ?? []) as Array<
    Omit<PaymentSummary, "amountRub"> & { amount_kopecks: number }
  >;
  const yookassaEnabled = salesEnabled() && Boolean(
    cloudSetting("YOOKASSA_SHOP_ID")?.trim() &&
      cloudSetting("YOOKASSA_SECRET_KEY")?.trim(),
  );
  const timewebEnabled = salesEnabled() && Boolean(cloudSetting("TIMEWEB_TOKEN")?.trim());
  return {
    user,
    services: services.map(({ metadataJson, ...service }) => ({
      ...service,
      autoRenew: Boolean(service.autoRenew),
      hasCredentials: credSet.has(service.id),
      metadata: parsePlainMetadata(metadataJson),
    })),
    orders: orders.results as Order[],
    activity: activity.results as Activity[],
    balance: user.demo ? 2480 : Math.round(currentBalance / 100),
    domainPersons: (persons?.results ?? []) as DomainPersonSummary[],
    sshKeys: (keys?.results ?? []) as SshKeySummary[],
    ledger: ledgerEntries.map(({ amount_kopecks, ...row }) => ({
      ...row,
      amountRub: Math.round(amount_kopecks / 100),
    })),
    payments: paymentEntries.map(({ amount_kopecks, ...row }) => ({
      ...row,
      amountRub: Math.round(amount_kopecks / 100),
    })),
    yookassaEnabled,
    timewebEnabled,
  };
}

export async function createDemo(): Promise<User> {
  const id = randomUUID();
  const now = Date.now();
  const inDays = (days: number) =>
    new Date(now + days * 86400000).toISOString();
  const insert = db().prepare(
      "INSERT INTO services (id,user_id,kind,name,status,price,renewal,details,address) VALUES (?,?,?,?,?,?,?,?,?)",
    );
  await batch(
    db()
      .prepare("DELETE FROM users WHERE demo=1 AND created<?")
      .bind(now - 86400000),
    db()
      .prepare(
        "INSERT INTO users (id,name,email,password,demo,created) VALUES (?,?,?,?,1,?)",
      )
      .bind(id, "Александр", `demo-${id}@example.invalid`, "", now),
    insert.bind(
      randomUUID(),
      id,
      "vps",
      "production-01",
      "running",
      890,
      inDays(12),
      "2 vCPU · 4 ГБ RAM · 50 ГБ NVMe|Москва|Ubuntu 24.04",
      "192.0.2.14",
    ),
    insert.bind(
      randomUUID(),
      id,
      "vps",
      "dev-sandbox",
      "stopped",
      490,
      inDays(24),
      "1 vCPU · 2 ГБ RAM · 25 ГБ NVMe|Санкт-Петербург|Debian 12",
      "192.0.2.28",
    ),
    insert.bind(
      randomUUID(),
      id,
      "domain",
      "your-project.ru",
      "active",
      690,
      inDays(58),
      "ns1.example.invalid|ns2.example.invalid",
      "",
    ),
    insert.bind(
      randomUUID(),
      id,
      "domain",
      "your-studio.com",
      "active",
      2690,
      inDays(185),
      "ns1.example.invalid|ns2.example.invalid",
      "",
    ),
    db()
      .prepare(
        "INSERT INTO orders (id,user_id,title,amount,created,status,request_key) VALUES (?,?,?,?,?,?,?)",
      )
      .bind(
        randomUUID(),
        id,
        "Сервер production-01 · Проект",
        890,
        new Date(now - 86400000 * 18).toISOString(),
        "demo",
        "seed",
      ),
    activityStatement(id, "Сервер production-01 запущен"),
    activityStatement(id, "Домен your-project.ru добавлен"),
  );
  return { id, name: "Александр", email: "demo@example.invalid", demo: true };
}
