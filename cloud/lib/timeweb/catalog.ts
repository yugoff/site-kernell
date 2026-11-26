import "server-only";
import { timewebRequest } from "./client";
import type {
  TimewebAccountFinances,
  TimewebAccountStatus,
  TimewebAppPreset,
  TimewebAppsPresets,
  TimewebBalancerPreset,
  TimewebCdnPreset,
  TimewebDatabaseConfigurator,
  TimewebDatabasePreset,
  TimewebDatabaseType,
  TimewebDedicatedPreset,
  TimewebK8sPreset,
  TimewebLocation,
  TimewebNetworkDrivePreset,
  TimewebRegistryPreset,
  TimewebRouterPreset,
  TimewebServerConfigurator,
  TimewebServerOs,
  TimewebServerPreset,
  TimewebServerSoftware,
  TimewebStoragePreset,
  TimewebTld,
} from "./types";

export async function fetchPublishedTlds(): Promise<TimewebTld[]> {
  const data = await timewebRequest<{ top_level_domains: TimewebTld[] }>(
    "/api/v1/tlds?is_published=true",
  );
  return Array.isArray(data.top_level_domains) ? data.top_level_domains : [];
}

export async function checkDomainAvailability(
  asciiDomain: string,
): Promise<boolean> {
  const data = await timewebRequest<{ is_domain_available: boolean }>(
    `/api/v1/check-domain/${encodeURIComponent(asciiDomain)}`,
    { timeoutMs: 5000, retries: 1 },
  );
  if (typeof data.is_domain_available !== "boolean") {
    throw new Error("Invalid domain availability response.");
  }
  return data.is_domain_available;
}

export async function fetchLocations(): Promise<TimewebLocation[]> {
  const data = await timewebRequest<{ locations: TimewebLocation[] }>(
    "/api/v2/locations",
  );
  return Array.isArray(data.locations) ? data.locations : [];
}

export async function fetchServerPresets(): Promise<TimewebServerPreset[]> {
  const data = await timewebRequest<{ server_presets: TimewebServerPreset[] }>(
    "/api/v1/presets/servers",
  );
  return Array.isArray(data.server_presets) ? data.server_presets : [];
}

export async function fetchServerOs(): Promise<TimewebServerOs[]> {
  const data = await timewebRequest<{ servers_os: TimewebServerOs[] }>(
    "/api/v1/os/servers",
  );
  return Array.isArray(data.servers_os) ? data.servers_os : [];
}

export async function fetchServerSoftware(): Promise<TimewebServerSoftware[]> {
  const data = await timewebRequest<{ servers_software: TimewebServerSoftware[] }>(
    "/api/v1/software/servers",
  );
  return Array.isArray(data.servers_software) ? data.servers_software : [];
}

export async function fetchServerConfigurators(): Promise<
  TimewebServerConfigurator[]
> {
  const data = await timewebRequest<{
    server_configurators: TimewebServerConfigurator[];
  }>("/api/v1/configurator/servers");
  return Array.isArray(data.server_configurators)
    ? data.server_configurators
    : [];
}

export async function fetchDatabaseTypes(): Promise<TimewebDatabaseType[]> {
  const data = await timewebRequest<{ types: TimewebDatabaseType[] }>(
    "/api/v1/database-types",
  );
  return Array.isArray(data.types) ? data.types : [];
}

export async function fetchDatabasePresets(): Promise<TimewebDatabasePreset[]> {
  const data = await timewebRequest<{
    databases_presets: TimewebDatabasePreset[];
  }>("/api/v2/presets/dbs");
  return Array.isArray(data.databases_presets) ? data.databases_presets : [];
}

export async function fetchDatabaseConfigurators(): Promise<
  TimewebDatabaseConfigurator[]
> {
  const data = await timewebRequest<{
    database_configurators: TimewebDatabaseConfigurator[];
  }>("/api/v1/configurator/databases");
  return Array.isArray(data.database_configurators)
    ? data.database_configurators
    : [];
}

export async function fetchStoragePresets(): Promise<TimewebStoragePreset[]> {
  const data = await timewebRequest<{ storages_presets: TimewebStoragePreset[] }>(
    "/api/v1/presets/storages",
  );
  return Array.isArray(data.storages_presets) ? data.storages_presets : [];
}

export async function fetchK8sPresets(): Promise<TimewebK8sPreset[]> {
  const data = await timewebRequest<{ k8s_presets: TimewebK8sPreset[] }>(
    "/api/v1/presets/k8s",
  );
  return Array.isArray(data.k8s_presets) ? data.k8s_presets : [];
}

export async function fetchK8sVersions(): Promise<string[]> {
  const data = await timewebRequest<{ k8s_versions: string[] }>(
    "/api/v1/k8s/k8s-versions",
  );
  return Array.isArray(data.k8s_versions) ? data.k8s_versions : [];
}

export async function fetchK8sNetworkDrivers(): Promise<string[]> {
  const data = await timewebRequest<{ network_drivers: string[] }>(
    "/api/v1/k8s/network-drivers",
  );
  return Array.isArray(data.network_drivers) ? data.network_drivers : [];
}

export async function fetchDedicatedPresets(): Promise<
  TimewebDedicatedPreset[]
> {
  const data = await timewebRequest<{
    dedicated_servers_presets: TimewebDedicatedPreset[];
  }>("/api/v1/presets/dedicated-servers");
  return Array.isArray(data.dedicated_servers_presets)
    ? data.dedicated_servers_presets
    : [];
}

export async function fetchBalancerPresets(): Promise<TimewebBalancerPreset[]> {
  const data = await timewebRequest<{
    balancers_presets: TimewebBalancerPreset[];
  }>("/api/v1/presets/balancers");
  return Array.isArray(data.balancers_presets) ? data.balancers_presets : [];
}

export async function fetchAppPresets(): Promise<TimewebAppsPresets> {
  const data = await timewebRequest<Partial<TimewebAppsPresets>>(
    "/api/v1/presets/apps",
  );
  return {
    backend_presets: Array.isArray(data.backend_presets)
      ? (data.backend_presets as TimewebAppPreset[])
      : [],
    frontend_presets: Array.isArray(data.frontend_presets)
      ? (data.frontend_presets as TimewebAppPreset[])
      : [],
  };
}

export async function fetchRegistryPresets(): Promise<TimewebRegistryPreset[]> {
  const data = await timewebRequest<{
    container_registry_presets: TimewebRegistryPreset[];
  }>("/api/v1/container-registry/presets");
  return Array.isArray(data.container_registry_presets)
    ? data.container_registry_presets
    : [];
}

export async function fetchCdnPresets(): Promise<TimewebCdnPreset[]> {
  const data = await timewebRequest<{
    http_resource_presets: TimewebCdnPreset[];
  }>("/api/v1/cdn/presets");
  return Array.isArray(data.http_resource_presets)
    ? data.http_resource_presets
    : [];
}

export async function fetchRouterPresets(): Promise<TimewebRouterPreset[]> {
  const data = await timewebRequest<{ router_presets: TimewebRouterPreset[] }>(
    "/api/v1/presets/routers",
  );
  return Array.isArray(data.router_presets) ? data.router_presets : [];
}

export async function fetchNetworkDrivePresets(): Promise<
  TimewebNetworkDrivePreset[]
> {
  const data = await timewebRequest<{
    network_drive_presets: TimewebNetworkDrivePreset[];
  }>("/api/v1/presets/network-drives");
  return Array.isArray(data.network_drive_presets)
    ? data.network_drive_presets
    : [];
}

export async function fetchAiModels(): Promise<Record<string, unknown>[]> {
  const data = await timewebRequest<{ models: Record<string, unknown>[] }>(
    "/api/v3/cloud-ai/models",
  );
  return Array.isArray(data.models) ? data.models : [];
}

export async function fetchAiTokenPackages(
  target: "agents" | "knowledge-bases",
): Promise<Record<string, unknown>[]> {
  const data = await timewebRequest<{
    token_packages: Record<string, unknown>[];
  }>(`/api/v1/cloud-ai/token-packages/${target}`);
  return Array.isArray(data.token_packages) ? data.token_packages : [];
}

export async function fetchAccountFinances(): Promise<TimewebAccountFinances> {
  const data = await timewebRequest<{ finances: TimewebAccountFinances }>(
    "/api/v1/account/finances",
  );
  return data.finances;
}

export async function fetchAccountStatus(): Promise<TimewebAccountStatus> {
  const data = await timewebRequest<{ status: TimewebAccountStatus }>(
    "/api/v1/account/status",
  );
  return data.status;
}

