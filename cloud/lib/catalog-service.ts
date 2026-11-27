import "server-only";
import { domainToASCII, domainToUnicode } from "node:url";
import { db } from "./database";
import { loadPriceCalculator } from "./pricing";
import { locations as fallbackLocations, operatingSystems as fallbackOs, plans as fallbackPlans, zones as fallbackZones } from "./catalog";
import {
  fetchAiModels,
  fetchAiTokenPackages,
  fetchAppPresets,
  fetchBalancerPresets,
  fetchCdnPresets,
  fetchDatabaseConfigurators,
  fetchDatabasePresets,
  fetchDatabaseTypes,
  fetchDedicatedPresets,
  fetchK8sNetworkDrivers,
  fetchK8sPresets,
  fetchK8sVersions,
  fetchLocations,
  fetchNetworkDrivePresets,
  fetchPublishedTlds,
  fetchRegistryPresets,
  fetchRouterPresets,
  fetchServerConfigurators,
  fetchServerOs,
  fetchServerPresets,
  fetchServerSoftware,
  fetchStoragePresets,
  timewebToken,
  type TimewebTld,
} from "./timeweb";

export const catalogCategories = [
  "domains",
  "vps",
  "dedicated",
  "databases",
  "s3",
  "k8s",
  "balancers",
  "cdn",
  "apps",
  "registries",
  "routers",
  "network_drives",
  "ai",
] as const;

export type CatalogCategory = (typeof catalogCategories)[number];
export type CatalogSource = "timeweb" | "cache" | "fallback";

type CacheRow = {
  category: string;
  payload_json: string;
  fetched_at: number;
  expires_at: number;
  source: string;
};

const CACHE_TTL_MS = 3_600_000;

async function loadCached<T>(
  cacheKey: string,
  fetcher: () => Promise<T>,
  ttlMs = CACHE_TTL_MS,
): Promise<{ data: T | null; source: CatalogSource; fetchedAt: number | null }> {
  const sql = db();
  const existing = await sql
    .prepare(
      "SELECT category,payload_json,fetched_at,expires_at,source FROM provider_catalog_cache WHERE category=?",
    )
    .get(cacheKey) as CacheRow | undefined;

  const now = Date.now();
  if (existing && existing.expires_at > now) {
    try {
      return {
        data: JSON.parse(existing.payload_json) as T,
        source: "cache",
        fetchedAt: existing.fetched_at,
      };
    } catch {
      // Fall through to refresh corrupted cache entries.
    }
  }

  if (!timewebToken()) {
    if (existing) {
      try {
        return {
          data: JSON.parse(existing.payload_json) as T,
          source: "cache",
          fetchedAt: existing.fetched_at,
        };
      } catch {
        // Ignore stale corrupt cache.
      }
    }
    return { data: null, source: "fallback", fetchedAt: null };
  }

  try {
    const fresh = await fetcher();
    const fetchedAt = Date.now();
    await sql
      .prepare(
        "INSERT INTO provider_catalog_cache (category,payload_json,fetched_at,expires_at,source) VALUES (?,?,?,?,'timeweb') ON CONFLICT(category) DO UPDATE SET payload_json=excluded.payload_json,fetched_at=excluded.fetched_at,expires_at=excluded.expires_at,source='timeweb'",
      )
      .run(cacheKey, JSON.stringify(fresh), fetchedAt, fetchedAt + ttlMs);
    return { data: fresh, source: "timeweb", fetchedAt };
  } catch {
    if (existing) {
      try {
        return {
          data: JSON.parse(existing.payload_json) as T,
          source: "cache",
          fetchedAt: existing.fetched_at,
        };
      } catch {
        // Fall through to null.
      }
    }
    return { data: null, source: "fallback", fetchedAt: null };
  }
}

async function priceRecords<T extends Record<string, unknown>>(
  items: T[],
  category: CatalogCategory,
  costField: "price" | "cost" | "cost_per_gb" = "price",
  keyField: string = "id",
) {
  if (!items.length) return [];
  const price = await loadPriceCalculator(category);
  return items.map((item) => {
    const rawCost = Number(item[costField] ?? 0);
    const key = item[keyField] !== undefined ? String(item[keyField]) : "";
    const pricing = price(rawCost, key);
    return {
      ...item,
      costPrice: pricing.costPrice,
      retailPrice: pricing.retailPrice,
      markupPercent: pricing.markupPercent,
    };
  });
}

export type DomainZoneOffering = {
  zone: string;
  asciiZone: string;
  registration: number;
  renewal: number;
  transfer: number;
  costRegistration: number;
  costRenewal: number;
  costTransfer: number;
  whoisPrivacyAvailable: boolean;
  whoisPrivacyPrice: number;
  allowedPeriods: string[];
};

export const TIMEWEB_LOCATION_LABELS: Record<string, string> = {
  "ru-1": "Москва (ru-1)",
  "ru-2": "Санкт-Петербург (ru-2)",
  "ru-3": "Новосибирск (ru-3)",
  "pl-1": "Гданьск, Польша (pl-1)",
  "kz-1": "Алматы, Казахстан (kz-1)",
  "nl-1": "Амстердам, Нидерланды (nl-1)",
  "de-1": "Франкфурт, Германия (de-1)",
  "us-4": "США (us-4)",
};

const PRIORITY_ZONES = ["ru", "рф", "com", "net", "org", "io", "dev", "app", "shop"];

export async function getPublishedTldsRaw(): Promise<{
  tlds: TimewebTld[];
  source: CatalogSource;
  fetchedAt: number | null;
}> {
  const { data, source, fetchedAt } = await loadCached(
    "tlds:published",
    fetchPublishedTlds,
  );
  return {
    tlds: data ?? [],
    source,
    fetchedAt,
  };
}

export async function getDomainZonesCatalog(published?: Awaited<ReturnType<typeof getPublishedTldsRaw>>): Promise<{
  zones: DomainZoneOffering[];
  allPublishedCount: number;
  source: CatalogSource;
  fetchedAt: number | null;
}> {
  const { tlds, source, fetchedAt } = published ?? await getPublishedTldsRaw();
  if (!tlds.length) {
    return {
      zones: fallbackZones.map((item) => ({
        zone: item.zone,
        asciiZone: domainToASCII(item.zone) || item.zone,
        registration: item.registration,
        renewal: item.renewal,
        transfer: item.renewal,
        costRegistration: item.registration,
        costRenewal: item.renewal,
        costTransfer: item.renewal,
        whoisPrivacyAvailable: item.zone !== "ru" && item.zone !== "рф",
        whoisPrivacyPrice: 0,
        allowedPeriods:
          item.zone === "ru" || item.zone === "рф"
            ? ["P1Y"]
            : ["P1Y", "P2Y", "P3Y"],
      })),
      allPublishedCount: fallbackZones.length,
      source: "fallback",
      fetchedAt,
    };
  }

  const mapped: DomainZoneOffering[] = [];
  const price = await loadPriceCalculator("domains");
  for (const tld of tlds) {
    if (!tld.is_published || typeof tld.name !== "string") continue;
    const raw = tld.name.replace(/^\./, "");
    const asciiZone = domainToASCII(raw);
    const zone = domainToUnicode(raw) || raw;
    if (!asciiZone) continue;

    const reg = price(tld.price, asciiZone);
    const ren = price(tld.prolong_price || tld.price, asciiZone);
    const trf = price(tld.transfer || tld.price, asciiZone);
    const priv = tld.whois_privacy_price
      ? price(tld.whois_privacy_price, asciiZone).retailPrice
      : 0;
    const rawPeriods = Array.isArray(tld.allowed_buy_periods)
      ? tld.allowed_buy_periods
          .map((item) => item.period)
          .filter((p) => /^P\d+Y$/.test(p))
      : [];
    const allowedPeriods = rawPeriods.length
      ? rawPeriods
      : asciiZone === "ru" || asciiZone === "xn--p1ai"
        ? ["P1Y", "P2Y", "P3Y"]
        : ["P1Y", "P2Y", "P3Y", "P5Y"];

    mapped.push({
      zone,
      asciiZone,
      registration: reg.retailPrice,
      renewal: ren.retailPrice,
      transfer: trf.retailPrice,
      costRegistration: reg.costPrice,
      costRenewal: ren.costPrice,
      costTransfer: trf.costPrice,
      whoisPrivacyAvailable:
        asciiZone !== "ru" &&
        asciiZone !== "xn--p1ai" &&
        Boolean(tld.is_whois_privacy_enabled),
      whoisPrivacyPrice: priv,
      allowedPeriods,
    });
  }

  mapped.sort((a, b) => {
    const ia = PRIORITY_ZONES.indexOf(a.zone);
    const ib = PRIORITY_ZONES.indexOf(b.zone);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a.registration - b.registration || a.zone.localeCompare(b.zone, "ru");
  });

  return {
    zones: mapped,
    allPublishedCount: mapped.length,
    source,
    fetchedAt,
  };
}

export type PricedVpsPreset = {
  id: number;
  slug?: string;
  name?: string;
  location: string;
  cpu: number;
  ram: number;
  disk: number;
  disk_type: string;
  bandwidth: number;
  description: string;
  description_short: string;
  costPrice: number;
  retailPrice: number;
  markupPercent: number;
};

export async function getVpsCatalogData(): Promise<{
  source: CatalogSource;
  fetchedAt: number | null;
  presets: PricedVpsPreset[];
  operatingSystems: Array<{
    id: number;
    family: string;
    name: string;
    version: string | null;
  }>;
  locations: Array<{
    location: string;
    location_code: string;
    availability_zones: string[];
  }>;
  configurators: unknown[];
  software: Array<{
    id: number;
    name: string;
    os_ids?: number[];
    description?: string;
  }>;
}> {
  const [presetsRes, osRes, locationsRes, configuratorsRes, softwareRes] =
    await Promise.all([
      loadCached("vps:presets", fetchServerPresets),
      loadCached("vps:os", fetchServerOs),
      loadCached("locations", fetchLocations),
      loadCached("vps:configurators", fetchServerConfigurators),
      loadCached("vps:software", fetchServerSoftware),
    ]);

  const source: CatalogSource =
    presetsRes.source === "fallback" ? "fallback" : presetsRes.source;

  const presets: PricedVpsPreset[] = presetsRes.data?.length
    ? (await priceRecords(presetsRes.data, "vps") as PricedVpsPreset[])
    : fallbackPlans.map((plan, index) => ({
        id: index + 1,
        slug: plan.id,
        name: plan.name,
        location: "ru-1",
        cpu: plan.cpu,
        ram: plan.ram * 1024,
        disk: plan.disk * 1024,
        disk_type: "nvme",
        bandwidth: 200,
        description: plan.description,
        description_short: plan.description,
        costPrice: plan.price,
        retailPrice: plan.price,
        markupPercent: 0,
      }));

  return {
    source,
    fetchedAt: presetsRes.fetchedAt,
    presets,
    operatingSystems:
      osRes.data ??
      fallbackOs.map((name, index) => ({
        id: index + 1,
        family: "linux",
        name,
        version: null,
      })),
    locations:
      locationsRes.data ??
      fallbackLocations.map((name, index) => ({
        location: index === 0 ? "ru-1" : "ru-2",
        location_code: "RU",
        availability_zones: [name],
      })),
    configurators: configuratorsRes.data ?? [],
    software: softwareRes.data ?? [],
  };
}

const simpleCategoryLoaders: Record<
  Exclude<CatalogCategory, "domains" | "vps" | "databases" | "k8s" | "apps" | "ai">,
  () => Promise<Record<string, unknown>>
> = {
  dedicated: async () => {
    const res = await loadCached("dedicated:presets", fetchDedicatedPresets);
    return {
      source: res.source,
      fetchedAt: res.fetchedAt,
      presets: await priceRecords(res.data ?? [], "dedicated"),
    };
  },
  s3: async () => {
    const res = await loadCached("s3:presets", fetchStoragePresets);
    return {
      source: res.source,
      fetchedAt: res.fetchedAt,
      presets: await priceRecords(res.data ?? [], "s3"),
    };
  },
  balancers: async () => {
    const res = await loadCached("balancers:presets", fetchBalancerPresets);
    return {
      source: res.source,
      fetchedAt: res.fetchedAt,
      presets: await priceRecords(res.data ?? [], "balancers"),
    };
  },
  cdn: async () => {
    const res = await loadCached("cdn:presets", fetchCdnPresets);
    return {
      source: res.source,
      fetchedAt: res.fetchedAt,
      presets: await priceRecords(res.data ?? [], "cdn", "cost"),
    };
  },
  registries: async () => {
    const res = await loadCached("registries:presets", fetchRegistryPresets);
    return {
      source: res.source,
      fetchedAt: res.fetchedAt,
      presets: await priceRecords(res.data ?? [], "registries"),
    };
  },
  routers: async () => {
    const res = await loadCached("routers:presets", fetchRouterPresets);
    return {
      source: res.source,
      fetchedAt: res.fetchedAt,
      presets: await priceRecords(res.data ?? [], "routers", "cost"),
    };
  },
  network_drives: async () => {
    const res = await loadCached(
      "network_drives:presets",
      fetchNetworkDrivePresets,
    );
    return {
      source: res.source,
      fetchedAt: res.fetchedAt,
      presets: await priceRecords(res.data ?? [], "network_drives", "cost_per_gb"),
    };
  },
};

export async function getCatalogByCategory(
  category: CatalogCategory,
): Promise<Record<string, unknown>> {
  if (category === "domains") return getDomainZonesCatalog();
  if (category === "vps") return getVpsCatalogData();

  if (category === "databases") {
    const [typesRes, presetsRes, confRes] = await Promise.all([
      loadCached("databases:types", fetchDatabaseTypes),
      loadCached("databases:presets", fetchDatabasePresets),
      loadCached("databases:configurators", fetchDatabaseConfigurators),
    ]);
    return {
      source: presetsRes.source,
      fetchedAt: presetsRes.fetchedAt,
      types: typesRes.data ?? [],
      presets: await priceRecords(presetsRes.data ?? [], "databases"),
      configurators: confRes.data ?? [],
    };
  }

  if (category === "k8s") {
    const [presetsRes, versionsRes, driversRes] = await Promise.all([
      loadCached("k8s:presets", fetchK8sPresets),
      loadCached("k8s:versions", fetchK8sVersions),
      loadCached("k8s:drivers", fetchK8sNetworkDrivers),
    ]);
    return {
      source: presetsRes.source,
      fetchedAt: presetsRes.fetchedAt,
      presets: await priceRecords(presetsRes.data ?? [], "k8s"),
      versions: versionsRes.data ?? [],
      networkDrivers: driversRes.data ?? [],
    };
  }

  if (category === "apps") {
    const res = await loadCached("apps:presets", fetchAppPresets);
    return {
      source: res.source,
      fetchedAt: res.fetchedAt,
      backendPresets: await priceRecords(res.data?.backend_presets ?? [], "apps"),
      frontendPresets: await priceRecords(res.data?.frontend_presets ?? [], "apps"),
    };
  }

  if (category === "ai") {
    const [modelsRes, agentPkgRes, kbPkgRes] = await Promise.all([
      loadCached("ai:models", fetchAiModels),
      loadCached("ai:token_packages:agents", () =>
        fetchAiTokenPackages("agents"),
      ),
      loadCached("ai:token_packages:kb", () =>
        fetchAiTokenPackages("knowledge-bases"),
      ),
    ]);
    return {
      source: modelsRes.source,
      fetchedAt: modelsRes.fetchedAt,
      models: modelsRes.data ?? [],
      agentTokenPackages: await priceRecords(agentPkgRes.data ?? [], "ai"),
      knowledgeBaseTokenPackages: await priceRecords(kbPkgRes.data ?? [], "ai"),
    };
  }

  return simpleCategoryLoaders[category]();
}

export async function getAllCatalogs() {
  const entries = await Promise.all(
    catalogCategories.map(
      async (category) => [category, await getCatalogByCategory(category)] as const,
    ),
  );
  return Object.fromEntries(entries) as Record<
    CatalogCategory,
    Record<string, unknown>
  >;
}

