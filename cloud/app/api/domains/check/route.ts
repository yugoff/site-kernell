import { randomInt } from "node:crypto";
import { domainToASCII, domainToUnicode } from "node:url";
import { ApiError, apiError, checkOrigin, jsonBody, rateLimit } from "@cloud/lib/auth";
import { zones as staticOrderZones } from "@cloud/lib/catalog";
import { getDomainZonesCatalog, getPublishedTldsRaw } from "@cloud/lib/catalog-service";
import {
  domainCandidates,
  type DomainAvailability,
  type DomainCandidate,
  type DomainSearchResult,
  type DomainZonePrice,
} from "@cloud/lib/domain-search";
import { checkDomainAvailability, timewebToken } from "@cloud/lib/timeweb";

export const runtime = "nodejs";

const recommendationLimit = 3;
const recommendationBudget = 6;
const popularZones = new Set(staticOrderZones.map(({ zone }) => domainToASCII(zone)));
const orderableZones = new Set<string>(staticOrderZones.map(({ zone }) => zone));
const domainPatterns = {
  ru: [
    "*-online", "*-pro", "*-studio", "*-lab", "*-team", "*-hub",
    "*-web", "*-site", "*-project", "*-digital", "*-space", "*-works",
    "*-club", "*-plus", "*-24", "my-*", "go-*", "get-*",
  ],
  "рф": [
    "*-онлайн", "*-про", "*-студия", "*-лаб", "*-команда", "*-центр",
    "*-веб", "*-сайт", "*-проект", "*-медиа", "*-пространство", "*-сервис",
    "*-клуб", "*-плюс", "*-24", "мой-*", "наш-*", "это-*",
  ],
};

function similarNames({ name, zone }: DomainCandidate, count: number): DomainCandidate[] {
  const label = name.slice(0, name.indexOf("."));
  const patterns = [...(zone === "рф" ? domainPatterns.рф : domainPatterns.ru)];
  return Array.from({ length: count }, () => {
    const [pattern] = patterns.splice(randomInt(patterns.length), 1);
    return { name: `${pattern.replace("*", label)}.${zone}`, zone };
  });
}

async function checkDomain(name: string): Promise<DomainAvailability> {
  const ascii = domainToASCII(name);
  if (!ascii || ascii.length > 253 || ascii.split(".").some((label) => label.length > 63))
    return "unavailable";

  try {
    const available = await checkDomainAvailability(ascii);
    return available ? "available" : "taken";
  } catch {
    // An upstream failure does not establish availability.
    return "unavailable";
  }
}

export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const { query } = await jsonBody(request);
    const candidates = typeof query === "string" && query.length <= 264
      ? domainCandidates(query)
      : [];
    if (!candidates.length)
      throw new ApiError(400, "Введите имя или полный домен, например my-project.shop.");

    if (!timewebToken())
      throw new ApiError(503, "Проверка доменов пока недоступна.");
    rateLimit("domains:check", 60, 60_000);

    const [{ tlds }, catalog] = await Promise.all([
      getPublishedTldsRaw(),
      getDomainZonesCatalog(),
    ]);
    const published = tlds.length
      ? new Set(
          tlds
            .filter((item) => item.is_published && typeof item.name === "string")
            .map((item) => domainToASCII(item.name.replace(/^\./, "")))
            .filter(Boolean),
        )
      : null;

    const results = await Promise.all(candidates.map(async ({ name, zone }) => {
      const asciiZone = domainToASCII(zone);
      let status: DomainAvailability;
      if ((published ?? popularZones).has(asciiZone)) status = await checkDomain(name);
      else status = published ? "unsupported" : "unavailable";
      return { name: domainToUnicode(name) || name, zone: domainToUnicode(zone) || zone, status };
    }));
    const taken = results.filter(({ status }) => status === "taken");
    const optionsPerZone = Math.ceil(recommendationBudget / Math.max(taken.length, 1));
    const byZone = taken.map((domain) => similarNames(domain, optionsPerZone));
    const alternatives = Array.from({ length: optionsPerZone }, (_, index) =>
      byZone.map((names) => names[index]),
    ).flat().slice(0, recommendationBudget);
    const verified = await Promise.all(alternatives.map(async (domain) => ({
      domain,
      status: await checkDomain(domain.name),
    })));
    const recommendations = verified
      .filter(({ status }) => status === "available")
      .slice(0, recommendationLimit)
      .map(({ domain }) => domain);

    const catalogByZone = new Map(catalog.zones.map((item) => [item.zone, item]));
    const prices: Record<string, DomainZonePrice> = {};
    for (const item of [...results, ...recommendations]) {
      if (prices[item.zone]) continue;
      const matched = catalogByZone.get(item.zone);
      if (matched) {
        prices[item.zone] = {
          registration: matched.registration,
          renewal: matched.renewal,
          orderable: published ? true : orderableZones.has(item.zone),
        };
      }
    }

    const data: DomainSearchResult = { results, recommendations, prices };
    return Response.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
