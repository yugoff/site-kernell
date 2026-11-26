import "server-only";
import { randomUUID } from "node:crypto";
import {
  db,
  ledgerBalanceKopecks,
  logActivity,
  logAudit,
  transaction,
} from "./database";
import {
  TimewebApiError,
  deleteBalancer,
  deleteCdnResource,
  deleteDatabaseCluster,
  deleteFloatingIp,
  deleteK8sCluster,
  deleteNetworkDrive,
  deleteRouter,
  deleteStorageBucket,
  deleteTimewebServer,
  fetchAccountFinances,
  fetchAccountStatus,
  patchDomainSettings,
  runDatabaseAction,
  runTimewebServerAction,
  suspendCdnResource,
  timewebToken,
} from "./timeweb";

const DAY_MS = 86_400_000;
const GRACE_PERIOD_MS = 7 * DAY_MS;

type SubscriptionRow = {
  id: string;
  user_id: string;
  service_id: string | null;
  order_id: string;
  kind: string;
  title: string;
  period: string;
  retail_kopecks: number;
  status: string;
  next_charge_at: number;
  grace_until: number | null;
  auto_renew: number;
};

/**
 * Processes due subscription renewals, suspensions when balance is insufficient,
 * and grace-period expirations inside serialized SQLite transactions.
 */
export function runBillingTick(now = Date.now()) {
  const sql = db();
  const due = sql
    .prepare(
      "SELECT id,user_id,service_id,order_id,kind,title,period,retail_kopecks,status,next_charge_at,grace_until,auto_renew FROM subscriptions WHERE status='active' AND next_charge_at<=? LIMIT 200",
    )
    .all(now) as SubscriptionRow[];

  let renewed = 0;
  let suspended = 0;
  const nowIso = new Date(now).toISOString();

  for (const sub of due) {
    transaction(() => {
      const current = sql
        .prepare(
          "SELECT status,next_charge_at,auto_renew,retail_kopecks,service_id,title,period,user_id FROM subscriptions WHERE id=?",
        )
        .get(sub.id) as SubscriptionRow | undefined;
      if (!current || current.status !== "active" || current.next_charge_at > now) {
        return;
      }

      const balanceKopecks = ledgerBalanceKopecks(current.user_id);
      if (current.auto_renew && balanceKopecks >= current.retail_kopecks) {
        const periodDays = current.period === "P1Y" ? 365 : 30;
        const nextChargeAt = current.next_charge_at + periodDays * DAY_MS;
        sql
          .prepare(
            "INSERT OR IGNORE INTO ledger_entries (id,user_id,direction,amount_kopecks,kind,reference_type,reference_id,idempotency_key,note,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
          )
          .run(
            randomUUID(),
            current.user_id,
            "debit",
            current.retail_kopecks,
            "renewal_charge",
            "subscription",
            sub.id,
            `renewal:${sub.id}:${current.next_charge_at}`,
            `Продление услуги: ${current.title}`,
            nowIso,
          );
        sql
          .prepare(
            "UPDATE subscriptions SET next_charge_at=?,updated_at=? WHERE id=?",
          )
          .run(nextChargeAt, nowIso, sub.id);
        logActivity(
          current.user_id,
          `Автопродление: ${current.title} (${Math.round(current.retail_kopecks / 100)} ₽)`,
        );
        logAudit(current.user_id, "subscription.renewed", "subscription", sub.id);
        renewed++;
        return;
      }

      sql
        .prepare(
          "UPDATE subscriptions SET status='suspended',grace_until=?,updated_at=? WHERE id=?",
        )
        .run(now + GRACE_PERIOD_MS, nowIso, sub.id);
      if (current.service_id) {
        sql
          .prepare("UPDATE services SET status='stopped' WHERE id=? AND user_id=?")
          .run(current.service_id, current.user_id);
      }
      logActivity(
        current.user_id,
        `Приостановлена услуга из-за нехватки средств: ${current.title}`,
      );
      logAudit(current.user_id, "subscription.suspended", "subscription", sub.id);
      suspended++;
    });
  }

  const expiredGrace = sql
    .prepare(
      "SELECT id,user_id,title FROM subscriptions WHERE status='suspended' AND grace_until IS NOT NULL AND grace_until<=? LIMIT 200",
    )
    .all(now) as Array<{ id: string; user_id: string; title: string }>;

  let terminationQueued = 0;
  for (const sub of expiredGrace) {
    transaction(() => {
      const updated = sql
        .prepare(
          "UPDATE subscriptions SET status='termination_pending',updated_at=? WHERE id=? AND status='suspended'",
        )
        .run(nowIso, sub.id);
      if (updated.changes === 1) {
        logAudit(
          sub.user_id,
          "subscription.grace_expired",
          "subscription",
          sub.id,
          { title: sub.title },
        );
        terminationQueued++;
      }
    });
  }

  return { renewed, suspended, terminationQueued };
}

/**
 * Reconciles suspended and termination-pending subscriptions with upstream
 * Timeweb resources (shuts down unpaid VPS and deletes expired ones).
 */
export async function reconcileSubscriptionsWithProvider(limit = 50) {
  if (!timewebToken()) {
    return { configured: false as const, suspendedUpstream: 0, terminatedUpstream: 0 };
  }
  const sql = db();
  const suspendedRows = sql
    .prepare(
      "SELECT s.id AS sub_id,s.user_id,s.title,srv.id AS service_id,srv.kind,srv.tw_resource_id FROM subscriptions s JOIN services srv ON srv.id=s.service_id WHERE s.status='suspended' AND srv.kind IN ('vps','database','cdn') AND srv.tw_resource_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM audit_logs a WHERE a.action='provider.vps_suspended' AND a.target_id=s.id) LIMIT ?",
    )
    .all(limit) as Array<{
    sub_id: string;
    user_id: string;
    title: string;
    service_id: string;
    kind: string;
    tw_resource_id: string;
  }>;

  let suspendedUpstream = 0;
  for (const row of suspendedRows) {
    try {
      if (row.kind === "vps") {
        await runTimewebServerAction(row.tw_resource_id, "shutdown");
      } else if (row.kind === "database") {
        await runDatabaseAction(row.tw_resource_id, "shutdown");
      } else if (row.kind === "cdn") {
        await suspendCdnResource(row.tw_resource_id);
      }
    } catch (error) {
      if (!(error instanceof TimewebApiError && error.statusCode === 409)) {
        continue;
      }
    }
    logAudit(row.user_id, "provider.vps_suspended", "subscription", row.sub_id, {
      serviceId: row.service_id,
      kind: row.kind,
      twResourceId: row.tw_resource_id,
    });
    suspendedUpstream++;
  }

  const terminatingRows = sql
    .prepare(
      "SELECT s.id AS sub_id,s.user_id,s.title,srv.id AS service_id,srv.kind,srv.tw_resource_id FROM subscriptions s LEFT JOIN services srv ON srv.id=s.service_id WHERE s.status='termination_pending' LIMIT ?",
    )
    .all(limit) as Array<{
    sub_id: string;
    user_id: string;
    title: string;
    service_id: string | null;
    kind: string | null;
    tw_resource_id: string | null;
  }>;

  let terminatedUpstream = 0;
  const nowIso = new Date().toISOString();
  for (const row of terminatingRows) {
    if (row.service_id && row.tw_resource_id) {
      try {
        if (row.kind === "vps") {
          await deleteTimewebServer(row.tw_resource_id);
        } else if (row.kind === "database") {
          await deleteDatabaseCluster(row.tw_resource_id);
        } else if (row.kind === "s3") {
          await deleteStorageBucket(row.tw_resource_id);
        } else if (row.kind === "k8s") {
          await deleteK8sCluster(row.tw_resource_id);
        } else if (row.kind === "balancer") {
          await deleteBalancer(row.tw_resource_id);
        } else if (row.kind === "router") {
          await deleteRouter(row.tw_resource_id);
        } else if (row.kind === "network_drive") {
          await deleteNetworkDrive(row.tw_resource_id);
        } else if (row.kind === "cdn") {
          await deleteCdnResource(row.tw_resource_id);
        } else if (row.kind === "floating_ip") {
          await deleteFloatingIp(row.tw_resource_id);
        } else if (row.kind === "domain") {
          await patchDomainSettings(row.tw_resource_id, {
            is_autoprolong_enabled: false,
          });
        }
      } catch (error) {
        if (!(error instanceof TimewebApiError && error.statusCode === 404)) {
          continue;
        }
      }
    }

    transaction(() => {
      sql
        .prepare(
          "UPDATE subscriptions SET status='terminated',updated_at=? WHERE id=? AND status='termination_pending'",
        )
        .run(nowIso, row.sub_id);
      if (row.service_id && row.kind !== "domain") {
        sql
          .prepare("DELETE FROM services WHERE id=? AND user_id=?")
          .run(row.service_id, row.user_id);
      } else if (row.service_id && row.kind === "domain") {
        sql
          .prepare("UPDATE services SET auto_renew=0 WHERE id=? AND user_id=?")
          .run(row.service_id, row.user_id);
      }
      logActivity(
        row.user_id,
        `Срок льготного периода истёк: ${row.title}`,
      );
      logAudit(row.user_id, "subscription.terminated", "subscription", row.sub_id, {
        twResourceId: row.tw_resource_id,
      });
    });
    terminatedUpstream++;
  }

  return {
    configured: true as const,
    suspendedUpstream,
    terminatedUpstream,
  };
}

/**
 * Monitors the Timeweb master partner account balance and lock status,
 * storing the latest snapshot and emitting warnings when runway is low.
 */
export async function checkProviderHealth() {
  if (!timewebToken()) {
    return { configured: false as const };
  }

  const [finances, status] = await Promise.all([
    fetchAccountFinances(),
    fetchAccountStatus(),
  ]);

  const alertLevel =
    status.is_blocked || status.is_permanent_blocked
      ? "blocked"
      : finances.hours_left !== null && finances.hours_left < 24
        ? "critical"
        : finances.hours_left !== null && finances.hours_left < 72
          ? "warning"
          : "ok";

  const snapshot = {
    checkedAt: new Date().toISOString(),
    alertLevel,
    balance: finances.balance,
    currency: finances.currency,
    discountPercent: finances.discount_percent,
    hourlyFee: finances.hourly_fee,
    monthlyFee: finances.monthly_fee,
    hoursLeft: finances.hours_left,
    isBlocked: status.is_blocked,
    isPermanentBlocked: status.is_permanent_blocked,
  };

  db()
    .prepare(
      "INSERT INTO provider_catalog_cache (category,payload_json,fetched_at,expires_at,source) VALUES ('timeweb:health',?,?,?,'timeweb') ON CONFLICT(category) DO UPDATE SET payload_json=excluded.payload_json,fetched_at=excluded.fetched_at,expires_at=excluded.expires_at,source='timeweb'",
    )
    .run(
      JSON.stringify(snapshot),
      Date.now(),
      Date.now() + 300_000,
    );

  if (alertLevel !== "ok") {
    console.warn("Timeweb master account health alert", snapshot);
  }

  return { configured: true as const, ...snapshot };
}

