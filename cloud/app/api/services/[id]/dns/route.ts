import { isIPv4, isIPv6 } from "node:net";
import {
  ApiError,
  apiError,
  apiUser,
  checkOrigin,
  jsonBody,
  rateLimit,
} from "@cloud/lib/auth";
import { db, logActivity, logAudit } from "@cloud/lib/database";
import { salesEnabled } from "@cloud/lib/sales";
import {
  TimewebApiError,
  createDomainDnsRecord,
  createDomainSubdomain,
  deleteDomainDnsRecord,
  fetchDomainDnsRecords,
  fetchDomainInfo,
  timewebToken,
  updateDomainDnsRecord,
  type TimewebDnsRecordInput,
} from "@cloud/lib/timeweb";

export const runtime = "nodejs";

async function ownedDomainService(userId: string, id: string) {
  const service = await db()
    .prepare(
      "SELECT id,name,kind,tw_resource_id FROM services WHERE id=? AND user_id=?",
    )
    .get(id, userId) as
    | { id: string; name: string; kind: string; tw_resource_id: string | null }
    | undefined;
  if (!service || service.kind !== "domain") {
    throw new ApiError(404, "Домен не найден.");
  }
  if (!service.tw_resource_id || !timewebToken()) {
    throw new ApiError(503, "Управление DNS-записями пока недоступно.");
  }
  return { ...service, fqdn: service.tw_resource_id };
}

function validateHost(value: unknown, label: string): string {
  const host = typeof value === "string" ? value.trim().toLowerCase().replace(/\.$/, "") : "";
  if (
    !host ||
    host.length > 253 ||
    !host
      .split(".")
      .every((part) => /^[a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9])?$/.test(part))
  ) {
    throw new ApiError(400, `Укажите корректное значение для «${label}».`);
  }
  return host;
}

function validateDnsInput(body: Record<string, unknown>): TimewebDnsRecordInput {
  const type = String(body.type || "").toUpperCase();
  const ttlRaw = body.ttl !== undefined && body.ttl !== "" ? Number(body.ttl) : 600;
  if (!Number.isInteger(ttlRaw) || ttlRaw < 60 || ttlRaw > 86_400) {
    throw new ApiError(400, "TTL должен быть от 60 до 86400 секунд.");
  }

  if (type === "A") {
    const value = typeof body.value === "string" ? body.value.trim() : "";
    if (!isIPv4(value)) {
      throw new ApiError(400, "Для A-записи укажите корректный IPv4-адрес.");
    }
    return { type: "A", value, ttl: ttlRaw };
  }

  if (type === "AAAA") {
    const value = typeof body.value === "string" ? body.value.trim() : "";
    if (!isIPv6(value)) {
      throw new ApiError(400, "Для AAAA-записи укажите корректный IPv6-адрес.");
    }
    return { type: "AAAA", value, ttl: ttlRaw };
  }

  if (type === "TXT") {
    const value = typeof body.value === "string" ? body.value.trim() : "";
    if (!value || value.length > 2048) {
      throw new ApiError(400, "Укажите текст для TXT-записи (до 2048 символов).");
    }
    return { type: "TXT", value, ttl: ttlRaw };
  }

  if (type === "CNAME") {
    return {
      type: "CNAME",
      value: validateHost(body.value, "Целевой хост CNAME"),
      ttl: ttlRaw,
    };
  }

  if (type === "MX") {
    const priority = Number(body.priority);
    if (!Number.isInteger(priority) || priority < 0 || priority > 65535) {
      throw new ApiError(400, "Укажите приоритет MX (0–65535).");
    }
    return {
      type: "MX",
      value: validateHost(body.value, "Почтовый сервер MX"),
      priority,
      ttl: ttlRaw,
    };
  }

  if (type === "SRV") {
    const service =
      typeof body.service === "string" ? body.service.trim().toLowerCase() : "";
    const protocol =
      typeof body.protocol === "string" ? body.protocol.trim().toLowerCase() : "";
    const priority = Number(body.priority);
    const port = Number(body.port);
    if (!/^_[a-z0-9-]+$/.test(service) || !/^_(tcp|udp)$/.test(protocol)) {
      throw new ApiError(
        400,
        "Для SRV-записи укажите сервис (например _sip) и протокол (_tcp или _udp).",
      );
    }
    if (
      !Number.isInteger(priority) ||
      priority < 0 ||
      priority > 65535 ||
      !Number.isInteger(port) ||
      port < 1 ||
      port > 65535
    ) {
      throw new ApiError(400, "Укажите корректные приоритет и порт (1–65535).");
    }
    return {
      type: "SRV",
      service,
      protocol,
      priority,
      port,
      host: validateHost(body.host, "Целевой хост SRV"),
      ttl: ttlRaw,
    };
  }

  throw new ApiError(400, "Поддерживаются DNS-записи: A, AAAA, TXT, CNAME, MX, SRV.");
}

async function resolveTargetFqdn(rootFqdn: string, rawSubdomain: unknown): Promise<string> {
  const sub =
    typeof rawSubdomain === "string"
      ? rawSubdomain.trim().toLowerCase().replace(/\.$/, "")
      : "";
  if (!sub || sub === "@") return rootFqdn;
  if (
    sub.length > 63 ||
    !sub
      .split(".")
      .every((label) => /^[a-z0-9_*](?:[a-z0-9_-]{0,61}[a-z0-9])?$/.test(label))
  ) {
    throw new ApiError(400, "Некорректное имя поддомена.");
  }
  const full = `${sub}.${rootFqdn}`;
  try {
    const info = await fetchDomainInfo(rootFqdn);
    const exists = info.subdomains?.some((item) => item.fqdn === full);
    if (!exists) {
      await createDomainSubdomain(rootFqdn, sub);
    }
  } catch (error) {
    if (!(error instanceof TimewebApiError && error.statusCode === 409)) {
      throw error;
    }
  }
  return full;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await apiUser();
    if (user.demo) {
      throw new ApiError(400, "Редактор DNS-записей недоступен в деморежиме.");
    }
    const { id } = await context.params;
    await rateLimit(`dns-read:${user.id}`, 60);
    const { fqdn } = await ownedDomainService(user.id, id);
    const records = await fetchDomainDnsRecords(fqdn);
    return Response.json(
      { fqdn, records },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    checkOrigin(request);
    const user = await apiUser();
    if (user.demo) {
      throw new ApiError(400, "Редактор DNS-записей недоступен в деморежиме.");
    }
    const { id } = await context.params;
    if (!salesEnabled()) {
      throw new ApiError(503, "Управление DNS-записями у провайдера пока отключено.");
    }
    await rateLimit(`dns-write:${user.id}`, 60);
    const { fqdn, name } = await ownedDomainService(user.id, id);
    const body = await jsonBody(request);
    const input = validateDnsInput(body);
    const targetFqdn = await resolveTargetFqdn(fqdn, body.subdomain);
    const record = await createDomainDnsRecord(targetFqdn, input);
    await logActivity(user.id, `Добавлена DNS-запись ${input.type} для ${name}`);
    await logAudit(user.id, "domain.dns_record_created", "service", id, {
      fqdn: targetFqdn,
      type: input.type,
      recordId: record.id,
    });
    return Response.json({ ok: true, record });
  } catch (error) {
    if (error instanceof TimewebApiError) {
      return apiError(
        new ApiError(
          error.statusCode >= 400 && error.statusCode < 500 ? error.statusCode : 502,
          error.message || "Не удалось создать DNS-запись.",
        ),
      );
    }
    return apiError(error);
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    checkOrigin(request);
    const user = await apiUser();
    if (user.demo) {
      throw new ApiError(400, "Редактор DNS-записей недоступен в деморежиме.");
    }
    const { id } = await context.params;
    if (!salesEnabled()) {
      throw new ApiError(503, "Управление DNS-записями у провайдера пока отключено.");
    }
    await rateLimit(`dns-write:${user.id}`, 60);
    const { fqdn, name } = await ownedDomainService(user.id, id);
    const body = await jsonBody(request);
    const recordId = Number(body.recordId);
    if (!Number.isInteger(recordId) || recordId <= 0) {
      throw new ApiError(400, "Укажите ID DNS-записи.");
    }
    const input = validateDnsInput(body);
    const target = typeof body.targetFqdn === "string" ? body.targetFqdn.trim().toLowerCase() : "";
    if (target && target !== fqdn && !target.endsWith(`.${fqdn}`)) {
      throw new ApiError(404, "Поддомен не найден.");
    }
    const targetFqdn = target || fqdn;
    const record = await updateDomainDnsRecord(targetFqdn, recordId, input);
    await logActivity(user.id, `Обновлена DNS-запись ${input.type} для ${name}`);
    await logAudit(user.id, "domain.dns_record_updated", "service", id, {
      fqdn: targetFqdn,
      recordId,
    });
    return Response.json({ ok: true, record });
  } catch (error) {
    if (error instanceof TimewebApiError) {
      return apiError(
        new ApiError(
          error.statusCode >= 400 && error.statusCode < 500 ? error.statusCode : 502,
          error.message || "Не удалось обновить DNS-запись.",
        ),
      );
    }
    return apiError(error);
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    checkOrigin(request);
    const user = await apiUser();
    if (user.demo) {
      throw new ApiError(400, "Редактор DNS-записей недоступен в деморежиме.");
    }
    const { id } = await context.params;
    if (!salesEnabled()) {
      throw new ApiError(503, "Управление DNS-записями у провайдера пока отключено.");
    }
    await rateLimit(`dns-write:${user.id}`, 60);
    const { fqdn, name } = await ownedDomainService(user.id, id);
    const { searchParams } = new URL(request.url);
    const recordId = Number(searchParams.get("recordId"));
    if (!Number.isInteger(recordId) || recordId <= 0) {
      throw new ApiError(400, "Укажите ID DNS-записи.");
    }
    const targetFqdnParam = searchParams.get("targetFqdn")?.trim().toLowerCase() || "";
    const targetFqdn =
      targetFqdnParam === fqdn || targetFqdnParam.endsWith(`.${fqdn}`)
        ? targetFqdnParam
        : fqdn;
    await deleteDomainDnsRecord(targetFqdn, recordId);
    await logActivity(user.id, `Удалена DNS-запись #${recordId} для ${name}`);
    await logAudit(user.id, "domain.dns_record_deleted", "service", id, {
      fqdn: targetFqdn,
      recordId,
    });
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof TimewebApiError) {
      return apiError(
        new ApiError(
          error.statusCode >= 400 && error.statusCode < 500 ? error.statusCode : 502,
          error.message || "Не удалось удалить DNS-запись.",
        ),
      );
    }
    return apiError(error);
  }
}

