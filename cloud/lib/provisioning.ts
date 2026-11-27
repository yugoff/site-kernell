import "server-only";
import { randomUUID } from "node:crypto";
import type { ServiceKind } from "./catalog";
import { TIMEWEB_LOCATION_LABELS } from "./catalog-service";
import { decryptJson } from "./crypto";
import {
  db,
  logAudit,
  serviceCredentialsStatement,
  batch,
  activityStatement,
  auditStatement,
} from "./database";
import { acquireLease } from "./leases";
import { salesEnabled } from "./sales";
import { provisionInfraJob, syncInfraService } from "./infra-provisioning";
import {
  TimewebApiError,
  checkDomainAvailability,
  createDomainRequest,
  createTimewebPerson,
  createTimewebProject,
  createTimewebServer,
  createTimewebSshKey,
  fetchDomainInfo,
  fetchDomainNameServers,
  fetchDomainRequest,
  fetchTimewebServer,
  payDomainRequest,
  timewebToken,
  type TimewebDomainInfo,
  type TimewebPersonInput,
  type TimewebServer,
} from "./timeweb";

const MAX_ATTEMPTS = 5;
async function providerLease(key: string) {
  const release = await acquireLease(key, 120_000);
  if (!release) throw new TimewebApiError(429, "resource_busy", null, key, "Ресурс подготавливается.");
  return release;
}

class FatalProvisioningError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FatalProvisioningError";
  }
}

type ProvisioningJobRow = {
  id: string;
  order_id: string;
  user_id: string;
  kind: string;
  payload_json: string;
  status: string;
  attempts: number;
};

type LocalOrderRow = {
  id: string;
  user_id: string;
  title: string;
  amount: number;
  status: string;
  cost_amount: number | null;
  retail_amount: number | null;
  provider_payload: string | null;
};

export function mapTimewebServerStatus(
  rawStatus: string,
): "running" | "stopped" | "provisioning" | "reinstalling" {
  if (rawStatus === "on") return "running";
  if (rawStatus === "reinstalling") return "reinstalling";
  if (
    rawStatus === "off" ||
    rawStatus === "blocked" ||
    rawStatus === "no_paid" ||
    rawStatus === "permanent_blocked" ||
    rawStatus === "removed" ||
    rawStatus === "removing"
  ) {
    return "stopped";
  }
  return "provisioning";
}

export function mapTimewebDomainStatus(
  info: TimewebDomainInfo | null,
): "active" | "provisioning" | "stopped" | "error" {
  if (!info) return "provisioning";
  if (info.request_status?.endsWith("_fail")) return "error";
  if (info.domain_status === "paid" || info.domain_status === "soon_expire") {
    return "active";
  }
  if (
    info.request_status === "registration_request" ||
    info.request_status === "prolongation_request" ||
    info.request_status === "transfer_request" ||
    info.request_status === "awaiting_person" ||
    info.domain_status === "awaiting_payment"
  ) {
    return "provisioning";
  }
  return "stopped";
}

export function extractMainIpv4(server: TimewebServer): string {
  for (const net of server.networks ?? []) {
    if (net.type !== "public" || !Array.isArray(net.ips)) continue;
    const main = net.ips.find((ip) => ip.type === "ipv4" && ip.is_main);
    if (main?.ip) return main.ip;
    const anyV4 = net.ips.find((ip) => ip.type === "ipv4");
    if (anyV4?.ip) return anyV4.ip;
  }
  return "";
}

export function formatServerDetails(
  server: TimewebServer,
  fallback?: Record<string, unknown>,
): string {
  const ramGb = Math.max(1, Math.round((server.ram || 1024) / 1024));
  const diskMb =
    server.disks?.reduce((sum, disk) => sum + (disk.size || 0), 0) ||
    Number(fallback?.diskMb || 0);
  const diskGb = Math.max(1, Math.round(diskMb / 1024));
  const diskType = (
    server.disks?.[0]?.type ||
    String(fallback?.diskType || "nvme")
  ).toUpperCase();
  const loc =
    TIMEWEB_LOCATION_LABELS[server.location] ||
    String(fallback?.locationLabel || server.location);
  const osRaw = server.os?.name
    ? `${server.os.name.charAt(0).toUpperCase()}${server.os.name.slice(1)}${
        server.os.version ? ` ${server.os.version}` : ""
      }`
    : String(fallback?.osLabel || "Linux");
  return `${server.cpu} vCPU · ${ramGb} ГБ RAM · ${diskGb} ГБ ${diskType}|${loc}|${osRaw}`;
}

export async function ensureUserTimewebProject(
  userId: string,
  userName: string,
): Promise<number> {
  const existing = await db()
    .prepare("SELECT tw_project_id FROM users WHERE id=?")
    .get(userId) as { tw_project_id: number | null } | undefined;
  if (existing?.tw_project_id) return existing.tw_project_id;

  const release = await providerLease(`project:${userId}`);
  try {
    const recheck = await db()
      .prepare("SELECT tw_project_id FROM users WHERE id=?")
      .get(userId) as { tw_project_id: number | null } | undefined;
    if (recheck?.tw_project_id) return recheck.tw_project_id;
    const project = await createTimewebProject(
      `kc-${userId.slice(0, 8)}`,
      `Kernell Cloud workspace (${userName.slice(0, 48)})`,
    );
    await db()
      .prepare("UPDATE users SET tw_project_id=? WHERE id=?")
      .run(project.id, userId);
    await logAudit(userId, "timeweb.project_created", "user", userId, {
      twProjectId: project.id,
    });
    return project.id;
  } finally {
    await release();
  }
}

export async function ensureTimewebPerson(
  userId: string,
  localPersonId: string,
): Promise<number> {
  const existing = await db()
    .prepare(
      "SELECT id,encrypted_payload,tw_person_id FROM domain_persons WHERE id=? AND user_id=?",
    )
    .get(localPersonId, userId) as
    | { id: string; encrypted_payload: string; tw_person_id: number | null }
    | undefined;
  if (!existing) {
    throw new FatalProvisioningError("Профиль администратора домена не найден.");
  }
  if (existing.tw_person_id) return existing.tw_person_id;

  const release = await providerLease(`person:${localPersonId}`);
  try {
    const recheck = await db()
      .prepare(
        "SELECT encrypted_payload,tw_person_id FROM domain_persons WHERE id=? AND user_id=?",
      )
      .get(localPersonId, userId) as
      | { encrypted_payload: string; tw_person_id: number | null }
      | undefined;
    if (!recheck) {
      throw new FatalProvisioningError(
        "Профиль администратора домена не найден.",
      );
    }
    if (recheck.tw_person_id) return recheck.tw_person_id;
    const payload = decryptJson<TimewebPersonInput>(recheck.encrypted_payload);
    const created = await createTimewebPerson(payload);
    await db()
      .prepare(
        "UPDATE domain_persons SET tw_person_id=?,updated_at=? WHERE id=? AND user_id=?",
      )
      .run(created.id, Date.now(), localPersonId, userId);
    await logAudit(userId, "timeweb.person_synced", "domain_person", localPersonId, {
      twPersonId: created.id,
    });
    return created.id;
  } finally {
    await release();
  }
}

export async function refundOrderIfNeeded(orderId: string, reason: string) {
  const sql = db();
  const order = await sql
    .prepare(
      "SELECT id,user_id,title,amount,status,retail_amount FROM orders WHERE id=?",
    )
    .get(orderId) as LocalOrderRow | undefined;
  if (!order) return;
  if (order.status !== "paid" && order.status !== "provisioning") return;

  const nowIso = new Date().toISOString();
  const retailRub = order.retail_amount ?? order.amount;
  const refundKopecks = Math.max(0, retailRub * 100);
  await batch(
    sql.prepare("UPDATE orders SET status='failed',updated_at=? WHERE id=? AND status IN ('paid','provisioning')")
      .bind(nowIso, order.id),
    activityStatement(
      order.user_id,
      `Заказ отклонён, средства (${retailRub} ₽) возвращены на баланс: ${order.title}`,
      true,
    ),
    auditStatement(order.user_id, "order.refunded", "order", order.id, {
      reason,
      refundKopecks,
    }, true),
    sql
      .prepare(
        "INSERT INTO ledger_entries (id,user_id,direction,amount_kopecks,kind,reference_type,reference_id,idempotency_key,note,created_at) SELECT ?,?,?,?,?,?,?,?,?,? WHERE changes()>0 AND ?>0 ON CONFLICT(user_id,idempotency_key) DO NOTHING",
      )
      .bind(
        randomUUID(),
        order.user_id,
        "credit",
        refundKopecks,
        "refund",
        "order",
        order.id,
        `refund:order:${order.id}`,
        `Возврат за заказ: ${order.title}`,
        nowIso,
        refundKopecks,
      ),
    sql
    .prepare(
      "UPDATE subscriptions SET status='canceled',updated_at=? WHERE order_id IN (SELECT id FROM orders WHERE id=? AND status='failed') AND status IN ('active','suspended')",
    )
    .bind(nowIso, order.id),
  );
}

async function persistPayloadProgress(
  jobId: string,
  orderId: string,
  payload: Record<string, unknown>,
) {
  const json = JSON.stringify(payload);
  const nowIso = new Date().toISOString();
  await batch(
    db()
      .prepare(
        "UPDATE provisioning_jobs SET payload_json=?,updated_at=? WHERE id=?",
      )
      .bind(json, nowIso, jobId),
    db()
      .prepare("UPDATE orders SET provider_payload=?,updated_at=? WHERE id=?")
      .bind(json, nowIso, orderId),
  );
}

async function resolveTimewebSshKeyIds(
  userId: string,
  localKeyIds: unknown,
): Promise<number[]> {
  if (!Array.isArray(localKeyIds) || !localKeyIds.length) return [];
  const ids = localKeyIds.filter((item): item is string => typeof item === "string");
  if (!ids.length) return [];

  const rows = await db()
    .prepare(
      `SELECT id,name,public_key,tw_ssh_key_id FROM ssh_keys WHERE user_id=? AND id IN (${ids.map(() => "?").join(",")})`,
    )
    .all(userId, ...ids) as Array<{
    id: string;
    name: string;
    public_key: string;
    tw_ssh_key_id: number | null;
  }>;

  const resolved: number[] = [];
  for (const row of rows) {
    if (row.tw_ssh_key_id) {
      resolved.push(row.tw_ssh_key_id);
      continue;
    }
    const created = await createTimewebSshKey(
      `kc-${userId.slice(0, 8)}-${row.name.slice(0, 36)}`,
      row.public_key,
      false,
    );
    await db()
      .prepare("UPDATE ssh_keys SET tw_ssh_key_id=? WHERE id=? AND user_id=?")
      .run(created.id, row.id, userId);
    resolved.push(created.id);
  }
  return resolved;
}

async function provisionVpsJob(
  job: ProvisioningJobRow,
  order: LocalOrderRow,
  payload: Record<string, unknown>,
) {
  const userRow = await db()
    .prepare("SELECT name FROM users WHERE id=?")
    .get(job.user_id) as { name: string } | undefined;
  const projectId = await ensureUserTimewebProject(
    job.user_id,
    userRow?.name || "Kernell Client",
  );

  let server: TimewebServer;
  if (typeof payload.twServerId === "number") {
    server = await fetchTimewebServer(payload.twServerId);
  } else {
    const sshKeyIds = await resolveTimewebSshKeyIds(job.user_id, payload.sshKeyIds);
    const serverName = String(payload.name || `srv-${order.id.slice(0, 8)}`);
    server = await createTimewebServer({
      name: serverName,
      hostname: serverName,
      preset_id: Number(payload.presetId),
      os_id: typeof payload.osId === "number" ? payload.osId : undefined,
      software_id:
        typeof payload.softwareId === "number" ? payload.softwareId : undefined,
      bandwidth:
        typeof payload.bandwidth === "number" ? payload.bandwidth : 200,
      is_ddos_guard: Boolean(payload.isDdosGuard),
      ...(sshKeyIds.length ? { ssh_keys_ids: sshKeyIds } : {}),
      ...(typeof payload.availabilityZone === "string"
        ? { availability_zone: payload.availabilityZone }
        : {}),
      project_id: projectId,
      comment: `kc-order:${order.id}`,
    });
    payload.twServerId = server.id;
    await persistPayloadProgress(job.id, order.id, payload);
  }

  const serviceStatus = mapTimewebServerStatus(server.status);
  const ipAddress = extractMainIpv4(server);
  const details = formatServerDetails(server, payload);
  const renewalIso = new Date(Date.now() + 30 * 86_400_000).toISOString();
  const metadata = {
    orderId: order.id,
    presetId: server.preset_id ?? payload.presetId ?? null,
    osId: server.os?.id ?? payload.osId ?? null,
    location: server.location || payload.location || "ru-1",
    cpu: server.cpu,
    ramMb: server.ram,
    disks: server.disks ?? [],
    networks: server.networks ?? [],
    isDdosGuard: server.is_ddos_guard,
    twStatus: server.status,
  };

  const sql = db();
  const existing = await sql
    .prepare(
      "SELECT id FROM services WHERE user_id=? AND kind='vps' AND tw_resource_id=?",
    )
    .get(job.user_id, String(server.id)) as { id: string } | undefined;
  const serviceId = existing?.id ?? randomUUID();

  const serviceWrite = existing
    ? sql
      .prepare(
        "UPDATE services SET status=?,details=?,address=?,tw_project_id=?,metadata_json=? WHERE id=? AND user_id=?",
      )
      .bind(
        serviceStatus,
        details,
        ipAddress,
        projectId,
        JSON.stringify(metadata),
        serviceId,
        job.user_id,
      )
    : sql
      .prepare(
        "INSERT INTO services (id,user_id,kind,name,status,price,renewal,details,address,auto_renew,tw_resource_id,tw_project_id,cost_price,metadata_json) VALUES (?,?,?,?,?,?,?,?,?,1,?,?,?,?)",
      )
      .bind(
        serviceId,
        job.user_id,
        "vps",
        server.name || String(payload.name),
        serviceStatus,
        order.retail_amount ?? order.amount,
        renewalIso,
        details,
        ipAddress,
        String(server.id),
        projectId,
        order.cost_amount ?? order.amount,
        JSON.stringify(metadata),
      );

  await batch(
    serviceWrite,
    ...(server.root_pass || server.vnc_pass ? [serviceCredentialsStatement(serviceId, job.user_id, {
      rootPass: server.root_pass,
      vncPass: server.vnc_pass,
    })] : []),
    sql
      .prepare("UPDATE subscriptions SET service_id=?,updated_at=? WHERE order_id=?")
      .bind(serviceId, new Date().toISOString(), order.id),
    sql
      .prepare("UPDATE orders SET status=?,updated_at=? WHERE id=?")
      .bind(
        serviceStatus === "running" ? "active" : "provisioning",
        new Date().toISOString(),
        order.id,
      ),
    sql
      .prepare(
        "UPDATE provisioning_jobs SET status='done',last_error=NULL,updated_at=? WHERE id=?",
      )
      .bind(new Date().toISOString(), job.id),

    activityStatement(
      job.user_id,
      serviceStatus === "running"
        ? `Сервер ${server.name} создан и готов к работе`
        : `Сервер ${server.name} устанавливается`,
    ),
    auditStatement(job.user_id, "vps.provisioned", "service", serviceId, {
      orderId: order.id,
      twServerId: server.id,
      status: server.status,
    }),

  );

  return { serviceId, status: serviceStatus };
}

async function provisionDomainJob(
  job: ProvisioningJobRow,
  order: LocalOrderRow,
  payload: Record<string, unknown>,
) {
  const action =
    payload.action === "prolong" || payload.action === "transfer"
      ? payload.action
      : "register";
  const ascii = String(payload.ascii || payload.name || "").toLowerCase();
  const displayName = String(payload.name || ascii);
  const period = String(payload.period || "P1Y");
  const years = Number(payload.years || 1);
  const isWhoisPrivacy = Boolean(payload.isWhoisPrivacy);

  if (action === "prolong" && !await db()
    .prepare("SELECT id FROM services WHERE user_id=? AND kind='domain' AND tw_resource_id=?")
    .get(job.user_id, ascii)) {
    throw new FatalProvisioningError("Домен не найден в вашем кабинете.");
  }
  let twPersonId: number | undefined;
  let localPersonId =
    typeof payload.personId === "string" ? payload.personId : "";
  if (!localPersonId && action !== "transfer") {
    const latest = await db()
      .prepare(
        "SELECT id FROM domain_persons WHERE user_id=? ORDER BY created_at DESC LIMIT 1",
      )
      .get(job.user_id) as { id: string } | undefined;
    localPersonId = latest?.id ?? "";
    if (localPersonId) payload.personId = localPersonId;
  }

  if (localPersonId) {
    twPersonId = await ensureTimewebPerson(job.user_id, localPersonId);
  } else if (action === "register") {
    throw new FatalProvisioningError(
      "Отсутствует профиль администратора домена.",
    );
  }

  if (typeof payload.twRequestId !== "number") {
    if (action === "register") {
      const available = await checkDomainAvailability(ascii);
      if (!available) {
        throw new FatalProvisioningError(`Домен ${displayName} уже занят.`);
      }
    }

    const req =
      action === "transfer"
        ? await createDomainRequest({
            action: "transfer",
            fqdn: ascii,
            auth_code: String(payload.authCode || ""),
          })
        : action === "prolong"
          ? await createDomainRequest({
              action: "prolong",
              fqdn: ascii,
              period,
              ...(twPersonId ? { person_id: twPersonId } : {}),
              is_autoprolong_enabled: true,
              is_whois_privacy_enabled: isWhoisPrivacy,
            })
          : await createDomainRequest({
              action: "register",
              fqdn: ascii,
              person_id: twPersonId!,
              period,
              is_autoprolong_enabled: true,
              is_whois_privacy_enabled: isWhoisPrivacy,
            });

    payload.twRequestId = req.id;
    await persistPayloadProgress(job.id, order.id, payload);
  }

  const requestId = Number(payload.twRequestId);
  if (!payload.paidUpstream) {
    await payDomainRequest(
      requestId,
      action === "transfer"
        ? {
            money_source: "free",
            auth_code: String(payload.authCode || ""),
            ...(twPersonId ? { person_id: twPersonId } : {}),
          }
        : {
            money_source: "use",
            ...(twPersonId ? { person_id: twPersonId } : {}),
          },
    );
    payload.paidUpstream = true;
    await persistPayloadProgress(job.id, order.id, payload);
  }

  const [domainInfo, reqInfo, nsEntries] = await Promise.all([
    fetchDomainInfo(ascii).catch(() => null),
    fetchDomainRequest(requestId).catch(() => null),
    fetchDomainNameServers(ascii).catch(() => []),
  ]);

  if (domainInfo?.request_status?.endsWith("_fail")) {
    throw new FatalProvisioningError(
      reqInfo?.message || `Регистратор отклонил заявку для ${displayName}.`,
    );
  }

  const nsList = nsEntries.flatMap(
    (entry) => entry.items?.map((item) => item.host) ?? [],
  );
  const nsDetails = nsList.length
    ? nsList.slice(0, 4).join("|")
    : "ns1.timeweb.ru|ns2.timeweb.ru";
  const status = mapTimewebDomainStatus(domainInfo);
  const renewalIso =
    domainInfo?.paid_till ||
    domainInfo?.expiration ||
    new Date(Date.now() + years * 365 * 86_400_000).toISOString();
  const metadata = {
    orderId: order.id,
    action,
    period,
    requestId,
    personId: localPersonId || null,
    twPersonId: twPersonId ?? null,
    domainStatus: domainInfo?.domain_status ?? null,
    requestStatus: domainInfo?.request_status ?? null,
    expiration: domainInfo?.expiration ?? null,
    paidTill: domainInfo?.paid_till ?? null,
    isWhoisPrivacy,
  };

  const sql = db();
  const existing = await sql
    .prepare(
      "SELECT id,renewal FROM services WHERE user_id=? AND kind='domain' AND tw_resource_id=?",
    )
    .get(job.user_id, ascii) as { id: string; renewal: string } | undefined;
  const serviceId = existing?.id ?? randomUUID();

  const serviceWrite = existing
    ? sql
      .prepare(
        "UPDATE services SET status=?,renewal=?,details=?,metadata_json=? WHERE id=? AND user_id=?",
      )
      .bind(
        status,
        renewalIso,
        nsDetails,
        JSON.stringify(metadata),
        serviceId,
        job.user_id,
      )
    : sql
      .prepare(
        "INSERT INTO services (id,user_id,kind,name,status,price,renewal,details,address,auto_renew,tw_resource_id,tw_project_id,cost_price,metadata_json) VALUES (?,?,?,?,?,?,?,?,?,1,?,NULL,?,?)",
      )
      .bind(
        serviceId,
        job.user_id,
        "domain",
        displayName,
        status,
        order.retail_amount ?? order.amount,
        renewalIso,
        nsDetails,
        "",
        ascii,
        order.cost_amount ?? order.amount,
        JSON.stringify(metadata),
      );

  await batch(
    serviceWrite,
    sql
      .prepare("UPDATE subscriptions SET service_id=?,updated_at=? WHERE order_id=?")
      .bind(serviceId, new Date().toISOString(), order.id),
    sql
      .prepare("UPDATE orders SET status=?,updated_at=? WHERE id=?")
      .bind(
        status === "active" ? "active" : "provisioning",
        new Date().toISOString(),
        order.id,
      ),
    sql
      .prepare(
        "UPDATE provisioning_jobs SET status='done',last_error=NULL,updated_at=? WHERE id=?",
      )
      .bind(new Date().toISOString(), job.id),

    activityStatement(
      job.user_id,
      action === "prolong"
        ? `Домен ${displayName} продлён`
        : status === "active"
          ? `Домен ${displayName} зарегистрирован и активен`
          : `Заявка на домен ${displayName} оплачена и обрабатывается`,
    ),
    auditStatement(job.user_id, "domain.provisioned", "service", serviceId, {
      orderId: order.id,
      action,
      fqdn: ascii,
      requestId,
      status,
    }),

  );

  return { serviceId, status };
}

function isRetryableProvisioningError(error: unknown): boolean {
  if (error instanceof FatalProvisioningError) return false;
  if (error instanceof TimewebApiError) {
    return (
      error.statusCode === 429 ||
      error.statusCode >= 500 ||
      error.errorCode === "upstream_network_error"
    );
  }
  return false;
}

export async function processSingleProvisioningJob(jobId: string) {
  if (!salesEnabled() || !timewebToken()) {
    return { skipped: true as const, reason: "provider_unavailable" };
  }

  const sql = db();
  const claimed = await sql
    .prepare(
      "UPDATE provisioning_jobs SET status='running',updated_at=? WHERE id=? AND status IN ('queued','retry') AND next_run_at<=? RETURNING id,order_id,user_id,kind,payload_json,status,attempts",
    )
    .get(new Date().toISOString(), jobId, Date.now()) as ProvisioningJobRow | undefined;

  if (!claimed) {
    return { skipped: true as const, reason: "not_claimable" };
  }

  const order = await sql
    .prepare(
      "SELECT id,user_id,title,amount,status,cost_amount,retail_amount,provider_payload FROM orders WHERE id=?",
    )
    .get(claimed.order_id) as LocalOrderRow | undefined;

  if (!order || (order.status !== "paid" && order.status !== "provisioning")) {
    await sql
      .prepare(
        "UPDATE provisioning_jobs SET status='failed',last_error='Order is not payable',updated_at=? WHERE id=?",
      )
      .run(new Date().toISOString(), claimed.id);
    return { ok: false as const, error: "Order is not payable" };
  }

  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(claimed.payload_json) as Record<string, unknown>;
  } catch {
    payload = {};
  }

  if (order.status === "paid") {
    await sql
      .prepare("UPDATE orders SET status='provisioning',updated_at=? WHERE id=?")
      .run(new Date().toISOString(), order.id);
  }

  try {
    let result: { serviceId: string; status: string };
    if (claimed.kind === "domain") {
      result = await provisionDomainJob(claimed, order, payload);
    } else if (claimed.kind === "vps") {
      result = await provisionVpsJob(claimed, order, payload);
    } else {
      const userRow = await db()
        .prepare("SELECT name FROM users WHERE id=?")
        .get(claimed.user_id) as { name: string } | undefined;
      result = await provisionInfraJob({
        jobId: claimed.id,
        orderId: order.id,
        userId: claimed.user_id,
        userName: userRow?.name || "Kernell Client",
        kind: claimed.kind as ServiceKind,
        retailAmount: order.retail_amount ?? order.amount,
        costAmount: order.cost_amount ?? order.amount,
        payload,
        ensureUserTimewebProject,
        persistPayloadProgress,
      });
    }
    return { ok: true as const, ...result };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Provisioning error";
    const retryable = isRetryableProvisioningError(error);
    const nextAttempts = claimed.attempts + 1;
    const nowIso = new Date().toISOString();

    if (error instanceof TimewebApiError && error.outcomeUnknown) {
      await batch(
        sql.prepare("UPDATE provisioning_jobs SET status='needs_review',attempts=?,last_error=?,updated_at=? WHERE id=?")
          .bind(nextAttempts, error.errorCode, nowIso, claimed.id),
        auditStatement(order.user_id, "provisioning.needs_review", "order", order.id, {
          responseId: error.responseId,
          code: error.errorCode,
        }),
      );
      return { ok: false as const, retryScheduled: false, error: "Проверяем выполнение заказа у провайдера." };
    }

    if (retryable && nextAttempts < MAX_ATTEMPTS) {
      const backoffMs = 5_000 * 2 ** claimed.attempts;
      await sql
        .prepare(
          "UPDATE provisioning_jobs SET status='retry',attempts=?,last_error=?,next_run_at=?,updated_at=? WHERE id=?",
        )
        .run(nextAttempts, msg.slice(0, 500), Date.now() + backoffMs, nowIso, claimed.id);
      return { ok: false as const, retryScheduled: true, error: msg };
    }

    await sql
      .prepare(
        "UPDATE provisioning_jobs SET status='failed',attempts=?,last_error=?,updated_at=? WHERE id=?",
      )
      .run(nextAttempts, msg.slice(0, 500), nowIso, claimed.id);

    // Refund wallet only if no upstream resource was already created.
    const alreadyCreatedUpstream =
      typeof payload.twServerId === "number" ||
      Boolean(payload.twResourceId) ||
      Boolean(payload.paidUpstream);
    if (!alreadyCreatedUpstream) {
      await refundOrderIfNeeded(order.id, msg);
    } else {
      await logAudit(order.user_id, "provisioning.failed_after_upstream", "order", order.id, {
        error: msg,
      });
    }
    return { ok: false as const, retryScheduled: false, error: msg };
  }
}

export async function processProvisioningQueue(limit = 20) {
  if (!salesEnabled() || !timewebToken()) {
    return { processed: 0, succeeded: 0, retrying: 0, failed: 0 };
  }
  // An interrupted job may have changed the provider before persisting progress.
  const stalled = await db().prepare(
    "UPDATE provisioning_jobs SET status='needs_review',last_error='Worker interrupted',updated_at=? WHERE status='running' AND updated_at<?",
  ).run(new Date().toISOString(), new Date(Date.now() - 10 * 60_000).toISOString());
  const due = await db()
    .prepare(
      "SELECT id FROM provisioning_jobs WHERE status IN ('queued','retry') AND next_run_at<=? ORDER BY created_at ASC LIMIT ?",
    )
    .all(Date.now(), limit) as Array<{ id: string }>;

  let succeeded = 0;
  let retrying = 0;
  let failed = 0;
  for (const job of due) {
    const res = await processSingleProvisioningJob(job.id);
    if ("ok" in res && res.ok) succeeded++;
    else if ("retryScheduled" in res && res.retryScheduled) retrying++;
    else if (!("skipped" in res && res.skipped)) failed++;
  }
  return { processed: due.length, succeeded, retrying, failed, needsReview: stalled.changes };
}

export async function syncServiceFromProvider(serviceId: string, userId?: string) {
  if (!timewebToken()) return null;

  const row = (userId
    ? await db()
        .prepare(
          "SELECT id,user_id,kind,name,status,renewal,details,address,tw_resource_id,metadata_json FROM services WHERE id=? AND user_id=?",
        )
        .get(serviceId, userId)
    : await db()
        .prepare(
          "SELECT id,user_id,kind,name,status,renewal,details,address,tw_resource_id,metadata_json FROM services WHERE id=?",
        )
        .get(serviceId)) as
    | {
        id: string;
        user_id: string;
        kind: ServiceKind;
        name: string;
        status: string;
        renewal: string;
        details: string;
        address: string;
        tw_resource_id: string | null;
        metadata_json: string | null;
      }
    | undefined;

  if (!row || !row.tw_resource_id) return null;

  let metadata: Record<string, unknown> = {};
  if (row.metadata_json) {
    try {
      metadata = JSON.parse(row.metadata_json) as Record<string, unknown>;
    } catch {
      metadata = {};
    }
  }

  if (row.kind !== "vps" && row.kind !== "domain") {
    return syncInfraService(
      { ...row, tw_resource_id: row.tw_resource_id },
      metadata,
    );
  }

  if (row.kind === "vps") {
    const server = await fetchTimewebServer(row.tw_resource_id);
    const nextStatus = mapTimewebServerStatus(server.status);
    const nextAddress = extractMainIpv4(server) || row.address;
    const nextDetails = formatServerDetails(server, metadata);
    const nextMeta = {
      ...metadata,
      presetId: server.preset_id ?? metadata.presetId ?? null,
      osId: server.os?.id ?? metadata.osId ?? null,
      location: server.location || metadata.location || "ru-1",
      cpu: server.cpu,
      ramMb: server.ram,
      disks: server.disks ?? [],
      networks: server.networks ?? [],
      isDdosGuard: server.is_ddos_guard,
      twStatus: server.status,
    };

    await batch(
      db()
        .prepare(
          "UPDATE services SET status=?,address=?,details=?,metadata_json=? WHERE id=?",
        )
        .bind(
          nextStatus,
          nextAddress,
          nextDetails,
          JSON.stringify(nextMeta),
          row.id,
        ),
      ...(typeof metadata.orderId === "string" && nextStatus === "running" ? [
        db()
          .prepare(
            "UPDATE orders SET status='active',updated_at=? WHERE id=? AND status='provisioning'",
          )
          .bind(new Date().toISOString(), metadata.orderId),
      ] : []),
      ...(server.root_pass || server.vnc_pass ? [serviceCredentialsStatement(row.id, row.user_id, {
        rootPass: server.root_pass,
        vncPass: server.vnc_pass,
      })] : []),
    );

    return {
      serviceId: row.id,
      status: nextStatus,
      address: nextAddress,
      server,
    };
  }

  const [domainInfo, nsEntries] = await Promise.all([
    fetchDomainInfo(row.tw_resource_id),
    fetchDomainNameServers(row.tw_resource_id).catch(() => []),
  ]);
  const nextStatus = mapTimewebDomainStatus(domainInfo);
  const nsList = nsEntries.flatMap(
    (entry) => entry.items?.map((item) => item.host) ?? [],
  );
  const nextDetails = nsList.length ? nsList.slice(0, 4).join("|") : row.details;
  const nextRenewal = domainInfo.paid_till || domainInfo.expiration || row.renewal;
  const nextMeta = {
    ...metadata,
    domainStatus: domainInfo.domain_status,
    requestStatus: domainInfo.request_status,
    expiration: domainInfo.expiration,
    paidTill: domainInfo.paid_till,
  };

  await batch(
    db()
      .prepare(
        "UPDATE services SET status=?,details=?,renewal=?,auto_renew=?,metadata_json=? WHERE id=?",
      )
      .bind(
        nextStatus,
        nextDetails,
        nextRenewal,
        domainInfo.is_autoprolong_enabled ? 1 : 0,
        JSON.stringify(nextMeta),
        row.id,
      ),
    ...(typeof metadata.orderId === "string" && nextStatus === "active" ? [
      db()
          .prepare(
            "UPDATE orders SET status='active',updated_at=? WHERE id=? AND status='provisioning'",
          )
        .bind(new Date().toISOString(), metadata.orderId),
    ] : []),
  );
  if (typeof metadata.orderId === "string" && nextStatus === "error") {
    await refundOrderIfNeeded(metadata.orderId, `Upstream domain request failed: ${domainInfo.request_status}`);
  }

  return {
    serviceId: row.id,
    status: nextStatus,
    domainInfo,
    nameservers: nsList,
  };
}

export async function syncPendingServices(limit = 30) {
  if (!timewebToken()) return { checked: 0, updated: 0 };
  const rows = await db()
    .prepare(
      "SELECT id FROM services WHERE tw_resource_id IS NOT NULL AND status IN ('provisioning','reinstalling') LIMIT ?",
    )
    .all(limit) as Array<{ id: string }>;

  let updated = 0;
  for (const row of rows) {
    try {
      const synced = await syncServiceFromProvider(row.id);
      if (synced) updated++;
    } catch (error) {
      console.error("Failed to sync service", row.id, error);
    }
  }
  return { checked: rows.length, updated };
}

