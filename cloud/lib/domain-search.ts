import { zones } from "./catalog";

export type DomainAvailability = "available" | "taken" | "unavailable" | "unsupported";
export type DomainCandidate = { name: string; zone: string };
export type DomainMatch = DomainCandidate & { status: DomainAvailability };
export type DomainZonePrice = {
  registration: number;
  renewal: number;
  orderable: boolean;
};
export type DomainSearchResult = {
  results: DomainMatch[];
  recommendations: DomainCandidate[];
  prices?: Record<string, DomainZonePrice>;
};

export function domainCandidates(query: string): DomainCandidate[] {
  const name = query
    .trim()
    .normalize("NFC")
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "")
    .replace(/[。．｡]/g, ".")
    .replace(/\.$/, "");
  const labels = name.split(".");
  if (
    name.length > 253 ||
    labels.some((label) => !/^[\p{L}\p{N}](?:[\p{L}\p{M}\p{N}-]{0,61}[\p{L}\p{M}\p{N}])?$/u.test(label))
  ) return [];

  if (labels.length > 1) return [{ name, zone: labels.slice(1).join(".") }];
  return zones.map(({ zone }) => ({ name: `${name}.${zone}`, zone }));
}
