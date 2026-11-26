import "server-only";
import { timewebRequest } from "./client";
import type {
  TimewebDnsRecord,
  TimewebDnsRecordInput,
  TimewebDomainInfo,
  TimewebDomainRequest,
  TimewebNameServerItem,
  TimewebNameServersEntry,
  TimewebPersonInput,
  TimewebPersonRecord,
} from "./types";

export async function createTimewebPerson(
  payload: TimewebPersonInput,
): Promise<TimewebPersonRecord> {
  const data = await timewebRequest<{ person: TimewebPersonRecord }>(
    "/api/v1/persons",
    { method: "POST", body: payload, timeoutMs: 12_000 },
  );
  return data.person;
}

export async function updateTimewebPerson(
  personId: number,
  payload: {
    address: string;
    email: string;
    phone: string;
    postcode: string;
  },
): Promise<TimewebPersonRecord> {
  const data = await timewebRequest<{ person: TimewebPersonRecord }>(
    `/api/v1/persons/${personId}`,
    { method: "PUT", body: payload, timeoutMs: 12_000 },
  );
  return data.person;
}

export type CreateDomainRequestInput =
  | {
      action: "register";
      fqdn: string;
      person_id: number;
      period: string;
      is_autoprolong_enabled?: boolean;
      is_whois_privacy_enabled?: boolean;
    }
  | {
      action: "prolong";
      fqdn: string;
      period: string;
      person_id?: number;
      is_autoprolong_enabled?: boolean;
      is_whois_privacy_enabled?: boolean;
    }
  | {
      action: "transfer";
      fqdn: string;
      auth_code: string;
    };

export async function createDomainRequest(
  payload: CreateDomainRequestInput,
): Promise<TimewebDomainRequest> {
  const data = await timewebRequest<{ request: TimewebDomainRequest }>(
    "/api/v1/domains-requests",
    { method: "POST", body: payload, timeoutMs: 12_000 },
  );
  return data.request;
}

export type PayDomainRequestInput =
  | {
      money_source: "use";
      person_id?: number;
    }
  | {
      money_source: "free";
      auth_code: string;
      person_id?: number;
    };

export async function payDomainRequest(
  requestId: number,
  payload: PayDomainRequestInput,
): Promise<TimewebDomainRequest> {
  const data = await timewebRequest<{ request: TimewebDomainRequest }>(
    `/api/v1/domains-requests/${requestId}`,
    { method: "PATCH", body: payload, timeoutMs: 15_000 },
  );
  return data.request;
}

export async function fetchDomainRequest(
  requestId: number,
): Promise<TimewebDomainRequest> {
  const data = await timewebRequest<{ request: TimewebDomainRequest }>(
    `/api/v1/domains-requests/${requestId}`,
  );
  return data.request;
}

export async function fetchDomainInfo(
  fqdn: string,
): Promise<TimewebDomainInfo> {
  const data = await timewebRequest<{ domain: TimewebDomainInfo }>(
    `/api/v1/domains/${encodeURIComponent(fqdn)}`,
  );
  return data.domain;
}

export async function patchDomainSettings(
  fqdn: string,
  payload: { is_autoprolong_enabled?: boolean; linked_ip?: string },
): Promise<TimewebDomainInfo> {
  const data = await timewebRequest<{ domain: TimewebDomainInfo }>(
    `/api/v1/domains/${encodeURIComponent(fqdn)}`,
    { method: "PATCH", body: payload },
  );
  return data.domain;
}

export async function deleteTimewebDomain(fqdn: string): Promise<void> {
  await timewebRequest<void>(`/api/v1/domains/${encodeURIComponent(fqdn)}`, {
    method: "DELETE",
  });
}

export async function fetchDomainNameServers(
  fqdn: string,
): Promise<TimewebNameServersEntry[]> {
  const data = await timewebRequest<{
    name_servers: TimewebNameServersEntry[];
  }>(`/api/v1/domains/${encodeURIComponent(fqdn)}/name-servers`);
  return Array.isArray(data.name_servers) ? data.name_servers : [];
}

export async function updateDomainNameServers(
  fqdn: string,
  nameServers: TimewebNameServerItem[],
): Promise<TimewebNameServersEntry[]> {
  const data = await timewebRequest<{
    name_servers: TimewebNameServersEntry[];
  }>(`/api/v1/domains/${encodeURIComponent(fqdn)}/name-servers`, {
    method: "PUT",
    body: { name_servers: nameServers },
    timeoutMs: 12_000,
  });
  return Array.isArray(data.name_servers) ? data.name_servers : [];
}

export async function createDomainSubdomain(
  rootFqdn: string,
  subdomainLabel: string,
): Promise<void> {
  await timewebRequest(
    `/api/v1/domains/${encodeURIComponent(rootFqdn)}/subdomains/${encodeURIComponent(subdomainLabel)}`,
    { method: "POST" },
  );
}

export async function fetchDomainDnsRecords(
  targetFqdn: string,
): Promise<TimewebDnsRecord[]> {
  const data = await timewebRequest<{ dns_records: TimewebDnsRecord[] }>(
    `/api/v2/domains/${encodeURIComponent(targetFqdn)}/dns-records?limit=100`,
  );
  return Array.isArray(data.dns_records) ? data.dns_records : [];
}

export async function createDomainDnsRecord(
  targetFqdn: string,
  payload: TimewebDnsRecordInput,
): Promise<TimewebDnsRecord> {
  const data = await timewebRequest<{ dns_record: TimewebDnsRecord }>(
    `/api/v2/domains/${encodeURIComponent(targetFqdn)}/dns-records`,
    { method: "POST", body: payload },
  );
  return data.dns_record;
}

export async function updateDomainDnsRecord(
  targetFqdn: string,
  recordId: number,
  payload: TimewebDnsRecordInput,
): Promise<TimewebDnsRecord> {
  const data = await timewebRequest<{ dns_record: TimewebDnsRecord }>(
    `/api/v2/domains/${encodeURIComponent(targetFqdn)}/dns-records/${recordId}`,
    { method: "PATCH", body: payload },
  );
  return data.dns_record;
}

export async function deleteDomainDnsRecord(
  targetFqdn: string,
  recordId: number,
): Promise<void> {
  await timewebRequest<void>(
    `/api/v2/domains/${encodeURIComponent(targetFqdn)}/dns-records/${recordId}`,
    { method: "DELETE" },
  );
}

