import "server-only";
import { domainToASCII, domainToUnicode } from "node:url";
import { ApiError } from "./auth";
import type { ServiceKind } from "./catalog";
import {
  locations as fallbackLocations,
  operatingSystems as fallbackOperatingSystems,
  plans as fallbackPlans,
} from "./catalog";
import {
  TIMEWEB_LOCATION_LABELS,
  getCatalogByCategory,
  getDomainZonesCatalog,
  getVpsCatalogData,
  type PricedVpsPreset,
} from "./catalog-service";
import { db } from "./database";
import { calculateRetailPrice } from "./pricing";

export type ResolvedOrderSpec = {
  kind: ServiceKind;
  title: string;
  costAmount: number;
  retailAmount: number;
  payload: Record<string, unknown>;
};

const LEGACY_LOCATION_MAP: Record<string, string> = {
  Москва: "ru-1",
  "Санкт-Петербург": "ru-2",
};

function formatOsLabel(os: { name: string; version: string | null }): string {
  const name = os.name.trim();
  const prettyName = name.charAt(0).toUpperCase() + name.slice(1);
  return os.version ? `${prettyName} ${os.version}`.trim() : prettyName;
}

function matchPreset(
  presets: PricedVpsPreset[],
  source: string,
  body: Record<string, unknown>,
  preferredLocation?: string,
): { preset: PricedVpsPreset; label: string } | null {
  const numericPresetId =
    typeof body.presetId === "number"
      ? body.presetId
      : typeof body.presetId === "string" && /^\d+$/.test(body.presetId)
        ? Number(body.presetId)
        : null;

  if (numericPresetId !== null) {
    const byId = presets.find((item) => item.id === numericPresetId);
    if (!byId) return null;
    const label =
      byId.name ||
      byId.description_short ||
      `${byId.cpu} vCPU · ${Math.round(byId.ram / 1024)} ГБ RAM`;
    return { preset: byId, label };
  }

  const planSlug = typeof body.plan === "string" ? body.plan.trim() : "";
  if (!planSlug) return null;

  const fallbackPlan = fallbackPlans.find((item) => item.id === planSlug);
  if (!fallbackPlan) return null;

  if (source === "fallback") {
    const bySlug = presets.find((item) => item.slug === planSlug);
    return bySlug ? { preset: bySlug, label: fallbackPlan.name } : null;
  }

  // Match live Timeweb preset by specs, preferring selected location if available.
  const targetRamMb = fallbackPlan.ram * 1024;
  const targetDiskMb = fallbackPlan.disk * 1024;
  const specMatches = presets.filter(
    (item) =>
      item.cpu === fallbackPlan.cpu &&
      item.ram === targetRamMb &&
      item.disk >= targetDiskMb,
  );
  const candidates = specMatches.length ? specMatches : presets;
  const byLocation = preferredLocation
    ? candidates.find((item) => item.location === preferredLocation)
    : undefined;
  const chosen = byLocation ?? candidates[0];
  if (!chosen) return null;
  return {
    preset: chosen,
    label: chosen.description_short || fallbackPlan.name,
  };
}

export async function resolveVpsOrderSpec(
  userId: string,
  body: Record<string, unknown>,
): Promise<ResolvedOrderSpec> {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!/^[a-zA-Z0-9][a-zA-Z0-9-]{1,47}$/.test(name)) {
    throw new ApiError(
      400,
      "Проверьте параметры сервера. Имя: 2–48 латинских букв, цифр или дефисов.",
    );
  }

  const vpsCatalog = await getVpsCatalogData();
  const rawLocation = typeof body.location === "string" ? body.location.trim() : "";
  const mappedLocation = LEGACY_LOCATION_MAP[rawLocation] ?? rawLocation;

  const presetMatch = matchPreset(
    vpsCatalog.presets,
    vpsCatalog.source,
    body,
    mappedLocation || undefined,
  );
  if (!presetMatch) {
    throw new ApiError(400, "Выбранная конфигурация сервера не найдена.");
  }

  const { preset, label: planLabel } = presetMatch;

  let locationCode = preset.location || "ru-1";
  let locationLabel = TIMEWEB_LOCATION_LABELS[locationCode] || locationCode;
  if (vpsCatalog.source === "fallback") {
    if (!fallbackLocations.includes(rawLocation)) {
      throw new ApiError(
        400,
        "Проверьте параметры сервера. Выберите доступную локацию.",
      );
    }
    locationLabel = rawLocation;
    locationCode = LEGACY_LOCATION_MAP[rawLocation] || "ru-1";
  } else if (rawLocation) {
    const validLoc = vpsCatalog.locations.find(
      (loc) => loc.location === mappedLocation,
    );
    if (!validLoc) {
      throw new ApiError(400, "Выбранная локация недоступна.");
    }
    locationCode = validLoc.location;
    locationLabel = TIMEWEB_LOCATION_LABELS[locationCode] || locationCode;
  }

  let resolvedOsId: number | null = null;
  let osLabel = "";
  const numericOsId =
    typeof body.osId === "number"
      ? body.osId
      : typeof body.osId === "string" && /^\d+$/.test(body.osId)
        ? Number(body.osId)
        : null;

  if (vpsCatalog.source === "fallback") {
    if (!fallbackOperatingSystems.includes(String(body.os))) {
      throw new ApiError(
        400,
        "Проверьте параметры сервера. Выберите операционную систему.",
      );
    }
    osLabel = String(body.os);
    const matched = vpsCatalog.operatingSystems.find(
      (item) => item.name.toLowerCase() === osLabel.toLowerCase(),
    );
    resolvedOsId = matched?.id ?? 1;
  } else if (numericOsId !== null) {
    const found = vpsCatalog.operatingSystems.find(
      (item) => item.id === numericOsId,
    );
    if (!found) {
      throw new ApiError(400, "Выбранная операционная система недоступна.");
    }
    resolvedOsId = found.id;
    osLabel = formatOsLabel(found);
  } else {
    const requestedOs = String(body.os || "").trim().toLowerCase();
    const found = vpsCatalog.operatingSystems.find((item) => {
      const full = `${item.name} ${item.version ?? ""}`.trim().toLowerCase();
      return (
        full === requestedOs ||
        full.startsWith(requestedOs) ||
        item.name.toLowerCase() === requestedOs
      );
    });
    if (!found) {
      throw new ApiError(400, "Выбранная операционная система недоступна.");
    }
    resolvedOsId = found.id;
    osLabel = formatOsLabel(found);
  }

  let softwareId: number | null = null;
  if (body.softwareId !== undefined && body.softwareId !== null && body.softwareId !== "") {
    const candidateSoftwareId = Number(body.softwareId);
    const software = vpsCatalog.software.find(
      (item) => item.id === candidateSoftwareId,
    );
    if (!software) {
      throw new ApiError(400, "Выбранный образ ПО не найден.");
    }
    softwareId = software.id;
  }

  let sshKeyIds: string[] = [];
  if (Array.isArray(body.sshKeyIds) && body.sshKeyIds.length) {
    const uniqueIds = Array.from(
      new Set(
        body.sshKeyIds
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim())
          .filter(Boolean),
      ),
    ).slice(0, 10);
    const rows = await db()
      .prepare(
        `SELECT id FROM ssh_keys WHERE user_id=? AND id IN (${uniqueIds.map(() => "?").join(",")})`,
      )
      .all(userId, ...uniqueIds) as Array<{ id: string }>;
    if (rows.length !== uniqueIds.length) {
      throw new ApiError(400, "Один из выбранных SSH-ключей не найден.");
    }
    sshKeyIds = uniqueIds;
  }

  const isDdosGuard = Boolean(body.isDdosGuard);
  let bandwidth = preset.bandwidth || 200;
  if (body.bandwidth !== undefined && body.bandwidth !== null) {
    const requestedBw = Number(body.bandwidth);
    if (
      !Number.isInteger(requestedBw) ||
      requestedBw < 100 ||
      requestedBw > 1000 ||
      requestedBw % 100 !== 0
    ) {
      throw new ApiError(
        400,
        "Пропускная способность должна быть от 100 до 1000 Мбит/с с шагом 100.",
      );
    }
    bandwidth = requestedBw;
  }

  const availabilityZone =
    typeof body.availabilityZone === "string" && body.availabilityZone.trim()
      ? body.availabilityZone.trim()
      : null;

  return {
    kind: "vps",
    title: `VPS ${name} · ${planLabel} · ${osLabel} · ${locationLabel}`,
    costAmount: Math.max(1, Math.round(preset.costPrice)),
    retailAmount: Math.max(1, Math.round(preset.retailPrice)),
    payload: {
      kind: "vps",
      presetId: preset.id,
      plan: preset.slug || String(preset.id),
      planLabel,
      name,
      osId: resolvedOsId,
      osLabel,
      location: locationCode,
      locationLabel,
      cpu: preset.cpu,
      ramMb: preset.ram,
      diskMb: preset.disk,
      diskType: preset.disk_type,
      bandwidth,
      isDdosGuard,
      ...(softwareId ? { softwareId } : {}),
      ...(sshKeyIds.length ? { sshKeyIds } : {}),
      ...(availabilityZone ? { availabilityZone } : {}),
    },
  };
}

export async function resolveDomainOrderSpec(
  userId: string,
  body: Record<string, unknown>,
): Promise<ResolvedOrderSpec> {
  const action =
    body.action === "prolong" || body.action === "transfer"
      ? body.action
      : "register";
  const rawName =
    typeof body.name === "string" ? body.name.trim().toLowerCase() : "";
  const ascii = domainToASCII(rawName);
  const validLabels =
    ascii &&
    ascii.length <= 253 &&
    ascii
      .split(".")
      .every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label));

  const zonesCatalog = await getDomainZonesCatalog();
  const sortedZones = [...zonesCatalog.zones].sort(
    (a, b) => b.asciiZone.length - a.asciiZone.length,
  );
  const matchedZone = validLabels
    ? sortedZones.find((z) => {
        const suffix = `.${z.asciiZone}`;
        if (!ascii.endsWith(suffix)) return false;
        const prefix = ascii.slice(0, ascii.length - suffix.length);
        return Boolean(prefix) && !prefix.includes(".");
      })
    : undefined;

  if (!matchedZone) {
    throw new ApiError(
      400,
      zonesCatalog.source === "fallback"
        ? "Введите корректный домен в зоне .ru, .рф, .com или .net."
        : "Введите корректное доменное имя в поддерживаемой зоне.",
    );
  }
  if (action === "prolong" && !await db()
    .prepare("SELECT id FROM services WHERE user_id=? AND kind='domain' AND tw_resource_id=?")
    .get(userId, ascii)) {
    throw new ApiError(404, "Домен не найден в вашем кабинете.");
  }

  let period = typeof body.period === "string" ? body.period.trim().toUpperCase() : "P1Y";
  let years = 1;
  if (action !== "transfer") {
    const match = /^P([1-9]\d?)Y$/.exec(period);
    if (!match) {
      throw new ApiError(400, "Укажите корректный период (например, P1Y).");
    }
    years = Number(match[1]);
    const isRuRf =
      matchedZone.asciiZone === "ru" || matchedZone.asciiZone === "xn--p1ai";
    if (years < 1 || years > (isRuRf ? 3 : 10)) {
      throw new ApiError(
        400,
        isRuRf
          ? "Для доменов .ru и .рф доступен период от 1 до 3 лет."
          : "Доступный период регистрации — от 1 до 10 лет.",
      );
    }
    if (
      matchedZone.allowedPeriods.length &&
      !matchedZone.allowedPeriods.includes(period)
    ) {
      throw new ApiError(
        400,
        `Выбранный период ${period} недоступен для зоны .${matchedZone.zone}.`,
      );
    }
  } else {
    period = "P1Y";
  }

  const authCode =
    typeof body.authCode === "string" ? body.authCode.trim() : "";
  if (action === "transfer" && (authCode.length < 3 || authCode.length > 64)) {
    throw new ApiError(400, "Для переноса домена укажите auth-код (EPP-код).");
  }

  let personId: string | null = null;
  if (typeof body.personId === "string" && body.personId.trim()) {
    const candidateId = body.personId.trim();
    const row = await db()
      .prepare("SELECT id FROM domain_persons WHERE id=? AND user_id=?")
      .get(candidateId, userId) as { id: string } | undefined;
    if (!row) {
      throw new ApiError(404, "Выбранный профиль администратора домена не найден.");
    }
    personId = row.id;
  }

  const isWhoisPrivacy =
    action !== "transfer" &&
    Boolean(body.whoisPrivacy) &&
    matchedZone.whoisPrivacyAvailable &&
    matchedZone.asciiZone !== "ru" &&
    matchedZone.asciiZone !== "xn--p1ai";

  const unitRetail =
    action === "transfer"
      ? matchedZone.transfer
      : action === "prolong"
        ? matchedZone.renewal
        : matchedZone.registration;
  const unitCost =
    action === "transfer"
      ? matchedZone.costTransfer
      : action === "prolong"
        ? matchedZone.costRenewal
        : matchedZone.costRegistration;

  const privacyAddition = isWhoisPrivacy
    ? matchedZone.whoisPrivacyPrice * years
    : 0;
  const retailAmount = Math.max(1, Math.round(unitRetail * years + privacyAddition));
  const costAmount = Math.max(1, Math.round(unitCost * years));

  const unicodeDomain = domainToUnicode(ascii) || rawName;
  const actionLabel =
    action === "prolong"
      ? `продление на ${years} г.`
      : action === "transfer"
        ? "перенос"
        : `регистрация на ${years === 1 ? "1 год" : `${years} г.`}`;

  return {
    kind: "domain",
    title: `Домен ${unicodeDomain} · ${actionLabel}`,
    costAmount,
    retailAmount,
    payload: {
      kind: "domain",
      action,
      name: unicodeDomain,
      ascii,
      zone: matchedZone.zone,
      asciiZone: matchedZone.asciiZone,
      period,
      years,
      isWhoisPrivacy,
      ...(personId ? { personId } : {}),
      ...(action === "transfer" ? { authCode } : {}),
    },
  };
}

function validResourceName(value: unknown, label = "Название"): string {
  const name = typeof value === "string" ? value.trim() : "";
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{1,47}$/.test(name)) {
    throw new ApiError(
      400,
      `Поле «${label}» должно содержать 2–48 латинских букв, цифр, точек или дефисов.`,
    );
  }
  return name;
}

type PricedPresetRow = Record<string, unknown> & {
  id: number;
  costPrice: number;
  retailPrice: number;
};

async function loadPricedPresets(
  category:
    | "databases"
    | "s3"
    | "k8s"
    | "balancers"
    | "routers"
    | "network_drives"
    | "cdn",
): Promise<{ raw: Record<string, unknown>; presets: PricedPresetRow[] }> {
  const data = await getCatalogByCategory(category);
  const presets = Array.isArray(data.presets)
    ? (data.presets as PricedPresetRow[])
    : [];
  if (!presets.length) {
    throw new ApiError(
      503,
      "Тарифы этой категории временно недоступны — синхронизируйте каталог с Timeweb.",
    );
  }
  return { raw: data, presets };
}

function findPresetById(presets: PricedPresetRow[], rawId: unknown): PricedPresetRow {
  const id = Number(rawId);
  const matched = Number.isInteger(id)
    ? presets.find((p) => Number(p.id) === id)
    : undefined;
  if (!matched) {
    throw new ApiError(400, "Выбранный тариф не найден в каталоге.");
  }
  return matched;
}

function dbEngineFamily(dbType: string): string {
  // Timeweb /database-types exposes versioned names like mysql8_4 or postgres16,
  // while /presets/dbs classifies presets by base family (mysql, postgres, etc.).
  return dbType.trim().toLowerCase().replace(/[0-9_]+$/, "");
}

export async function resolveInfraOrderSpec(
  userId: string,
  kind: ServiceKind,
  body: Record<string, unknown>,
): Promise<ResolvedOrderSpec> {
  if (kind === "database") {
    const name = validResourceName(body.name, "Имя кластера БД");
    const { raw, presets } = await loadPricedPresets("databases");
    const types = Array.isArray(raw.types)
      ? (raw.types as Array<{ type: string; name: string; version: string }>)
      : [];
    const dbType = typeof body.dbType === "string" ? body.dbType.trim() : "";
    if (!dbType || (types.length && !types.some((t) => t.type === dbType))) {
      throw new ApiError(400, "Выберите поддерживаемую СУБД.");
    }
    const preset = findPresetById(presets, body.presetId);
    if (
      preset.type &&
      dbEngineFamily(String(preset.type)) !== dbEngineFamily(dbType)
    ) {
      throw new ApiError(400, "Выбранный тариф не соответствует типу СУБД.");
    }
    const adminLogin =
      typeof body.adminLogin === "string" && body.adminLogin.trim()
        ? body.adminLogin.trim()
        : "kc_admin";
    if (!/^[a-zA-Z][a-zA-Z0-9_]{2,31}$/.test(adminLogin)) {
      throw new ApiError(400, "Логин администратора БД: 3–32 символа (латиница/цифры/_).");
    }
    const instanceName =
      typeof body.instanceName === "string" && body.instanceName.trim()
        ? body.instanceName.trim()
        : "default_db";
    return {
      kind: "database",
      title: `БД ${name} (${dbType})`,
      costAmount: Math.max(1, Math.round(preset.costPrice)),
      retailAmount: Math.max(1, Math.round(preset.retailPrice)),
      payload: {
        kind: "database",
        name,
        dbType,
        presetId: preset.id,
        adminLogin,
        instanceName,
        ...(typeof body.availabilityZone === "string" && body.availabilityZone.trim()
          ? { availabilityZone: body.availabilityZone.trim() }
          : {}),
      },
    };
  }

  if (kind === "s3") {
    const name = typeof body.name === "string" ? body.name.trim().toLowerCase() : "";
    if (!/^[a-z0-9][a-z0-9-]{2,61}[a-z0-9]$/.test(name)) {
      throw new ApiError(
        400,
        "Имя S3-бакета: 4–63 строчных латинских буквы, цифры или дефисы.",
      );
    }
    const bucketType = body.bucketType === "public" ? "public" : "private";
    const { presets } = await loadPricedPresets("s3");
    const preset = findPresetById(presets, body.presetId);
    return {
      kind: "s3",
      title: `S3 бакет ${name} (${bucketType === "public" ? "публичный" : "приватный"})`,
      costAmount: Math.max(1, Math.round(preset.costPrice)),
      retailAmount: Math.max(1, Math.round(preset.retailPrice)),
      payload: {
        kind: "s3",
        name,
        bucketType,
        presetId: preset.id,
      },
    };
  }

  if (kind === "k8s") {
    const name = validResourceName(body.name, "Имя кластера Kubernetes");
    const { raw, presets } = await loadPricedPresets("k8s");
    const versions = Array.isArray(raw.versions) ? (raw.versions as string[]) : [];
    const drivers = Array.isArray(raw.networkDrivers)
      ? (raw.networkDrivers as string[])
      : [];
    const k8sVersion =
      typeof body.k8sVersion === "string" ? body.k8sVersion.trim() : "";
    const networkDriver =
      typeof body.networkDriver === "string" ? body.networkDriver.trim() : "";
    if (!k8sVersion || (versions.length && !versions.includes(k8sVersion))) {
      throw new ApiError(400, "Выберите поддерживаемую версию Kubernetes.");
    }
    if (!networkDriver || (drivers.length && !drivers.includes(networkDriver))) {
      throw new ApiError(400, "Выберите поддерживаемый сетевой драйвер CNI.");
    }
    const masterPreset = findPresetById(presets, body.presetId);
    const workerPreset = findPresetById(
      presets,
      body.workerPresetId ?? body.presetId,
    );
    const workerCount = Number(body.workerCount ?? 1);
    if (!Number.isInteger(workerCount) || workerCount < 1 || workerCount > 20) {
      throw new ApiError(400, "Количество worker-нод: от 1 до 20.");
    }
    const costAmount = Math.max(
      1,
      Math.round(masterPreset.costPrice + workerPreset.costPrice * workerCount),
    );
    const retailAmount = Math.max(
      1,
      Math.round(
        masterPreset.retailPrice + workerPreset.retailPrice * workerCount,
      ),
    );
    return {
      kind: "k8s",
      title: `Kubernetes ${name} · ${k8sVersion} (${workerCount} нод)`,
      costAmount,
      retailAmount,
      payload: {
        kind: "k8s",
        name,
        k8sVersion,
        networkDriver,
        presetId: masterPreset.id,
        workerPresetId: workerPreset.id,
        workerCount,
        isIngress: body.isIngress !== false,
        ...(typeof body.availabilityZone === "string" && body.availabilityZone.trim()
          ? { availabilityZone: body.availabilityZone.trim() }
          : {}),
      },
    };
  }

  if (kind === "balancer") {
    const name = validResourceName(body.name, "Имя балансировщика");
    const algo = body.algo === "leastconn" ? "leastconn" : "roundrobin";
    const proto = ["http", "http2", "https", "tcp"].includes(String(body.proto))
      ? (String(body.proto) as "http" | "http2" | "https" | "tcp")
      : "http";
    const port = Number(body.port ?? 80);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new ApiError(400, "Укажите порт (1–65535).");
    }
    const { presets } = await loadPricedPresets("balancers");
    const preset = findPresetById(presets, body.presetId);
    return {
      kind: "balancer",
      title: `Балансировщик ${name} (${proto.toUpperCase()}:${port})`,
      costAmount: Math.max(1, Math.round(preset.costPrice)),
      retailAmount: Math.max(1, Math.round(preset.retailPrice)),
      payload: {
        kind: "balancer",
        name,
        algo,
        proto,
        port,
        isSsl: Boolean(body.isSsl),
        presetId: preset.id,
      },
    };
  }

  if (kind === "router") {
    const name = validResourceName(body.name, "Имя роутера");
    const { presets } = await loadPricedPresets("routers");
    const preset = findPresetById(presets, body.presetId);
    return {
      kind: "router",
      title: `Облачный роутер ${name}`,
      costAmount: Math.max(1, Math.round(preset.costPrice)),
      retailAmount: Math.max(1, Math.round(preset.retailPrice)),
      payload: { kind: "router", name, presetId: preset.id },
    };
  }

  if (kind === "network_drive") {
    const name = validResourceName(body.name, "Имя сетевого диска");
    const { presets } = await loadPricedPresets("network_drives");
    const preset = findPresetById(presets, body.presetId);
    const minGb = Number(preset.min || 10);
    const maxGb = Number(preset.max || 10000);
    const stepGb = Number(preset.step || 10);
    const sizeGb = Number(body.sizeGb);
    if (
      !Number.isInteger(sizeGb) ||
      sizeGb < minGb ||
      sizeGb > maxGb ||
      (sizeGb - minGb) % stepGb !== 0
    ) {
      throw new ApiError(
        400,
        `Размер сетевого диска: от ${minGb} до ${maxGb} ГБ с шагом ${stepGb} ГБ.`,
      );
    }
    const rawCost = Number(preset.cost_per_gb || 1) * sizeGb;
    const priced = await calculateRetailPrice(rawCost, "network_drives", String(preset.id));
    return {
      kind: "network_drive",
      title: `Сетевой диск ${name} (${sizeGb} ГБ)`,
      costAmount: Math.max(1, Math.round(priced.costPrice)),
      retailAmount: Math.max(1, Math.round(priced.retailPrice)),
      payload: { kind: "network_drive", name, presetId: preset.id, sizeGb },
    };
  }

  if (kind === "cdn") {
    const name = validResourceName(body.name, "Имя CDN-ресурса");
    const { presets } = await loadPricedPresets("cdn");
    const preset = findPresetById(presets, body.presetId);
    let storageTwId: number | undefined;
    let originHost: string | undefined;
    let originPort = Number(body.originPort ?? 443);

    if (typeof body.storageServiceId === "string" && body.storageServiceId.trim()) {
      const s3 = await db()
        .prepare(
          "SELECT tw_resource_id FROM services WHERE id=? AND user_id=? AND kind='s3'",
        )
        .get(body.storageServiceId.trim(), userId) as
        | { tw_resource_id: string | null }
        | undefined;
      if (!s3 || !s3.tw_resource_id) {
        throw new ApiError(404, "Выбранный S3-бакет не найден.");
      }
      storageTwId = Number(s3.tw_resource_id);
    } else {
      const host =
        typeof body.originHost === "string" ? body.originHost.trim().toLowerCase() : "";
      if (!host || host.length > 253 || !/^[a-z0-9.-]+$/.test(host)) {
        throw new ApiError(400, "Укажите S3-бакет или корректный адрес origin-сервера.");
      }
      if (!Number.isInteger(originPort) || originPort < 1 || originPort > 65535) {
        throw new ApiError(400, "Укажите порт origin-сервера (1–65535).");
      }
      originHost = host;
    }

    return {
      kind: "cdn",
      title: `CDN ${name}`,
      costAmount: Math.max(1, Math.round(preset.costPrice)),
      retailAmount: Math.max(1, Math.round(preset.retailPrice)),
      payload: {
        kind: "cdn",
        name,
        presetId: preset.id,
        useHttps: body.useHttps !== false,
        ...(storageTwId ? { storageTwId } : {}),
        ...(originHost ? { originHost, originPort } : {}),
        ...(typeof body.deliveryDomain === "string" && body.deliveryDomain.trim()
          ? { deliveryDomain: body.deliveryDomain.trim().toLowerCase() }
          : {}),
      },
    };
  }

  if (kind === "floating_ip") {
    const zone =
      typeof body.availabilityZone === "string" && body.availabilityZone.trim()
        ? body.availabilityZone.trim()
        : "msk-1";
    const isDdosGuard = Boolean(body.isDdosGuard);
    const costBase = isDdosGuard ? 250 : 150;
    const priced = await calculateRetailPrice(
      costBase,
      "floating_ips",
      isDdosGuard ? "ddos" : "standard",
    );
    return {
      kind: "floating_ip",
      title: `Плавающий IP (${zone}${isDdosGuard ? ", DDoS" : ""})`,
      costAmount: Math.max(1, Math.round(priced.costPrice)),
      retailAmount: Math.max(1, Math.round(priced.retailPrice)),
      payload: {
        kind: "floating_ip",
        availabilityZone: zone,
        isDdosGuard,
      },
    };
  }

  throw new ApiError(400, "Выбранный тип услуги нельзя оформить через заказ.");
}

