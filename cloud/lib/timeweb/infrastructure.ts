import "server-only";
import { timewebRequest, timewebRequestText } from "./client";
import type {
  TimewebBalancer,
  TimewebBalancerRule,
  TimewebCdnResource,
  TimewebDatabaseAdmin,
  TimewebDatabaseCluster,
  TimewebDatabaseInstance,
  TimewebFirewallGroup,
  TimewebFirewallRule,
  TimewebFloatingIp,
  TimewebK8sCluster,
  TimewebK8sNodeGroup,
  TimewebMailbox,
  TimewebNetworkDrive,
  TimewebRouter,
  TimewebStorageBucket,
  TimewebVpc,
} from "./types";

// === DBaaS ===

export async function createDatabaseCluster(input: {
  name: string;
  type: string;
  preset_id: number;
  project_id: number;
  admin?: { login: string; password: string };
  instance?: { name: string };
  availability_zone?: string;
  description?: string;
}): Promise<TimewebDatabaseCluster> {
  const data = await timewebRequest<{ db: TimewebDatabaseCluster }>(
    "/api/v1/databases",
    { method: "POST", body: input, timeoutMs: 15_000 },
  );
  return data.db;
}

export async function fetchDatabaseCluster(
  dbId: number | string,
): Promise<TimewebDatabaseCluster> {
  const data = await timewebRequest<{ db: TimewebDatabaseCluster }>(
    `/api/v1/databases/${encodeURIComponent(String(dbId))}`,
  );
  return data.db;
}

export async function deleteDatabaseCluster(dbId: number | string): Promise<void> {
  await timewebRequest<void>(
    `/api/v1/databases/${encodeURIComponent(String(dbId))}`,
    { method: "DELETE", timeoutMs: 12_000 },
  );
}

export async function runDatabaseAction(
  dbId: number | string,
  action: "start" | "shutdown" | "reboot",
): Promise<void> {
  await timewebRequest<void>(
    `/api/v1/databases/${encodeURIComponent(String(dbId))}/action`,
    { method: "POST", body: { action }, timeoutMs: 12_000 },
  );
}

export async function listDatabaseAdmins(
  dbId: number | string,
): Promise<TimewebDatabaseAdmin[]> {
  const data = await timewebRequest<{ admins: TimewebDatabaseAdmin[] }>(
    `/api/v1/databases/${encodeURIComponent(String(dbId))}/admins`,
  );
  return Array.isArray(data.admins) ? data.admins : [];
}

export async function createDatabaseAdmin(
  dbId: number | string,
  input: { login: string; password: string; host?: string; for_all?: boolean },
): Promise<TimewebDatabaseAdmin> {
  const data = await timewebRequest<{ admin: TimewebDatabaseAdmin }>(
    `/api/v1/databases/${encodeURIComponent(String(dbId))}/admins`,
    { method: "POST", body: input },
  );
  return data.admin;
}

export async function listDatabaseInstances(
  dbId: number | string,
): Promise<TimewebDatabaseInstance[]> {
  const data = await timewebRequest<{ instances: TimewebDatabaseInstance[] }>(
    `/api/v1/databases/${encodeURIComponent(String(dbId))}/instances`,
  );
  return Array.isArray(data.instances) ? data.instances : [];
}

export async function createDatabaseInstance(
  dbId: number | string,
  input: { name: string; description?: string },
): Promise<TimewebDatabaseInstance> {
  const data = await timewebRequest<{ instance: TimewebDatabaseInstance }>(
    `/api/v1/databases/${encodeURIComponent(String(dbId))}/instances`,
    { method: "POST", body: input },
  );
  return data.instance;
}

// === Object Storage (S3) ===
// IMPORTANT: Never expose global /api/v1/storages/users to end customers.

export async function createStorageBucket(input: {
  name: string;
  type: "private" | "public";
  preset_id: number;
  project_id: number;
  description?: string;
}): Promise<TimewebStorageBucket> {
  const data = await timewebRequest<{ bucket: TimewebStorageBucket }>(
    "/api/v1/storages/buckets",
    { method: "POST", body: input, timeoutMs: 15_000 },
  );
  return data.bucket;
}

export async function fetchStorageBucket(
  bucketId: number | string,
): Promise<TimewebStorageBucket> {
  const data = await timewebRequest<{ bucket: TimewebStorageBucket }>(
    `/api/v1/storages/buckets/${encodeURIComponent(String(bucketId))}`,
  );
  return data.bucket;
}

export async function updateStorageBucket(
  bucketId: number | string,
  input: { bucket_type?: "private" | "public"; preset_id?: number; description?: string },
): Promise<TimewebStorageBucket> {
  const data = await timewebRequest<{ bucket: TimewebStorageBucket }>(
    `/api/v1/storages/buckets/${encodeURIComponent(String(bucketId))}`,
    { method: "PATCH", body: input },
  );
  return data.bucket;
}

export async function deleteStorageBucket(bucketId: number | string): Promise<void> {
  await timewebRequest<void>(
    `/api/v1/storages/buckets/${encodeURIComponent(String(bucketId))}`,
    { method: "DELETE", timeoutMs: 12_000 },
  );
}

export async function addStorageSubdomains(
  bucketId: number | string,
  subdomains: string[],
): Promise<void> {
  await timewebRequest(
    `/api/v1/storages/buckets/${encodeURIComponent(String(bucketId))}/subdomains`,
    { method: "POST", body: { subdomains } },
  );
}

export async function generateStorageCertificate(subdomain: string): Promise<void> {
  await timewebRequest<void>("/api/v1/storages/certificates/generate", {
    method: "POST",
    body: { subdomain },
    timeoutMs: 12_000,
  });
}

// === Managed Kubernetes ===

export async function createK8sCluster(input: {
  name: string;
  description?: string;
  k8s_version: string;
  network_driver: string;
  preset_id: number;
  project_id: number;
  is_ingress?: boolean;
  availability_zone?: string;
  worker_groups: Array<{ name: string; preset_id: number; node_count: number }>;
}): Promise<TimewebK8sCluster> {
  const data = await timewebRequest<{ cluster: TimewebK8sCluster }>(
    "/api/v1/k8s/clusters",
    { method: "POST", body: input, timeoutMs: 15_000 },
  );
  return data.cluster;
}

export async function fetchK8sCluster(
  clusterId: number | string,
): Promise<TimewebK8sCluster> {
  const data = await timewebRequest<{ cluster: TimewebK8sCluster }>(
    `/api/v1/k8s/clusters/${encodeURIComponent(String(clusterId))}`,
  );
  return data.cluster;
}

export async function deleteK8sCluster(clusterId: number | string): Promise<void> {
  await timewebRequest<void>(
    `/api/v1/k8s/clusters/${encodeURIComponent(String(clusterId))}`,
    { method: "DELETE", timeoutMs: 12_000 },
  );
}

export async function fetchK8sKubeconfig(
  clusterId: number | string,
): Promise<string> {
  return timewebRequestText(
    `/api/v1/k8s/clusters/${encodeURIComponent(String(clusterId))}/kubeconfig`,
  );
}

export async function listK8sNodeGroups(
  clusterId: number | string,
): Promise<TimewebK8sNodeGroup[]> {
  const data = await timewebRequest<{ node_groups: TimewebK8sNodeGroup[] }>(
    `/api/v1/k8s/clusters/${encodeURIComponent(String(clusterId))}/groups`,
  );
  return Array.isArray(data.node_groups) ? data.node_groups : [];
}

export async function addK8sNodes(
  clusterId: number | string,
  groupId: number | string,
  count: number,
): Promise<void> {
  await timewebRequest(
    `/api/v1/k8s/clusters/${encodeURIComponent(String(clusterId))}/groups/${encodeURIComponent(String(groupId))}/nodes`,
    { method: "POST", body: { count } },
  );
}

export async function removeK8sNodes(
  clusterId: number | string,
  groupId: number | string,
  count: number,
): Promise<void> {
  await timewebRequest<void>(
    `/api/v1/k8s/clusters/${encodeURIComponent(String(clusterId))}/groups/${encodeURIComponent(String(groupId))}/nodes`,
    { method: "DELETE", body: { count } },
  );
}

// === Balancers ===

export async function createBalancer(input: {
  name: string;
  algo: "roundrobin" | "leastconn";
  proto: "http" | "http2" | "https" | "tcp";
  port: number;
  preset_id: number;
  project_id: number;
  is_ssl?: boolean;
  availability_zone?: string;
}): Promise<TimewebBalancer> {
  const data = await timewebRequest<{ balancer: TimewebBalancer }>(
    "/api/v1/balancers",
    { method: "POST", body: input, timeoutMs: 15_000 },
  );
  return data.balancer;
}

export async function fetchBalancer(
  balancerId: number | string,
): Promise<TimewebBalancer> {
  const data = await timewebRequest<{ balancer: TimewebBalancer }>(
    `/api/v1/balancers/${encodeURIComponent(String(balancerId))}`,
  );
  return data.balancer;
}

export async function deleteBalancer(balancerId: number | string): Promise<void> {
  await timewebRequest<void>(
    `/api/v1/balancers/${encodeURIComponent(String(balancerId))}`,
    { method: "DELETE", timeoutMs: 12_000 },
  );
}

export async function listBalancerRules(
  balancerId: number | string,
): Promise<TimewebBalancerRule[]> {
  const data = await timewebRequest<{ rules: TimewebBalancerRule[] }>(
    `/api/v1/balancers/${encodeURIComponent(String(balancerId))}/rules`,
  );
  return Array.isArray(data.rules) ? data.rules : [];
}

export async function createBalancerRule(
  balancerId: number | string,
  rule: {
    balancer_proto: string;
    balancer_port: number;
    server_proto: string;
    server_port: number;
  },
): Promise<TimewebBalancerRule> {
  const data = await timewebRequest<{ rule: TimewebBalancerRule }>(
    `/api/v1/balancers/${encodeURIComponent(String(balancerId))}/rules`,
    { method: "POST", body: rule },
  );
  return data.rule;
}

export async function deleteBalancerRule(
  balancerId: number | string,
  ruleId: number | string,
): Promise<void> {
  await timewebRequest<void>(
    `/api/v1/balancers/${encodeURIComponent(String(balancerId))}/rules/${encodeURIComponent(String(ruleId))}`,
    { method: "DELETE" },
  );
}

export async function addBalancerIps(
  balancerId: number | string,
  ips: string[],
): Promise<void> {
  await timewebRequest<void>(
    `/api/v1/balancers/${encodeURIComponent(String(balancerId))}/ips`,
    { method: "POST", body: { ips } },
  );
}

// === Firewall (account-global; ownership strictly tracked in Kernell DB) ===

export async function createFirewallGroup(
  name: string,
  description?: string,
): Promise<TimewebFirewallGroup> {
  const data = await timewebRequest<{ group: TimewebFirewallGroup }>(
    "/api/v1/firewall/groups",
    { method: "POST", body: { name, ...(description ? { description } : {}) } },
  );
  return data.group;
}

export async function fetchFirewallGroup(
  groupId: string,
): Promise<TimewebFirewallGroup> {
  const data = await timewebRequest<{ group: TimewebFirewallGroup }>(
    `/api/v1/firewall/groups/${encodeURIComponent(groupId)}`,
  );
  return data.group;
}

export async function deleteFirewallGroup(groupId: string): Promise<void> {
  await timewebRequest<void>(
    `/api/v1/firewall/groups/${encodeURIComponent(groupId)}`,
    { method: "DELETE" },
  );
}

export async function listFirewallRules(
  groupId: string,
): Promise<TimewebFirewallRule[]> {
  const data = await timewebRequest<{ rules: TimewebFirewallRule[] }>(
    `/api/v1/firewall/groups/${encodeURIComponent(groupId)}/rules`,
  );
  return Array.isArray(data.rules) ? data.rules : [];
}

export async function createFirewallRule(
  groupId: string,
  rule: {
    direction: "ingress" | "egress";
    protocol: "tcp" | "udp" | "icmp";
    port?: string;
    cidr: string;
    description?: string;
  },
): Promise<TimewebFirewallRule> {
  const data = await timewebRequest<{ rule: TimewebFirewallRule }>(
    `/api/v1/firewall/groups/${encodeURIComponent(groupId)}/rules`,
    { method: "POST", body: rule },
  );
  return data.rule;
}

export async function deleteFirewallRule(
  groupId: string,
  ruleId: string,
): Promise<void> {
  await timewebRequest<void>(
    `/api/v1/firewall/groups/${encodeURIComponent(groupId)}/rules/${encodeURIComponent(ruleId)}`,
    { method: "DELETE" },
  );
}

export async function linkFirewallResource(
  groupId: string,
  resourceId: string | number,
  resourceType = "server",
): Promise<void> {
  await timewebRequest(
    `/api/v1/firewall/groups/${encodeURIComponent(groupId)}/resources/${encodeURIComponent(String(resourceId))}?resource_type=${encodeURIComponent(resourceType)}`,
    { method: "POST" },
  );
}

export async function unlinkFirewallResource(
  groupId: string,
  resourceId: string | number,
  resourceType = "server",
): Promise<void> {
  await timewebRequest<void>(
    `/api/v1/firewall/groups/${encodeURIComponent(groupId)}/resources/${encodeURIComponent(String(resourceId))}?resource_type=${encodeURIComponent(resourceType)}`,
    { method: "DELETE" },
  );
}

// === VPC, Floating IPs, Routers, Network Drives ===

export async function createVpc(input: {
  name: string;
  subnet_v4: string;
  location: string;
  description?: string;
}): Promise<TimewebVpc> {
  const data = await timewebRequest<{ vpc: TimewebVpc }>("/api/v2/vpcs", {
    method: "POST",
    body: input,
  });
  return data.vpc;
}

export async function fetchVpc(vpcId: string): Promise<TimewebVpc> {
  const data = await timewebRequest<{ vpc: TimewebVpc }>(
    `/api/v2/vpcs/${encodeURIComponent(vpcId)}`,
  );
  return data.vpc;
}

export async function deleteVpc(vpcId: string): Promise<void> {
  await timewebRequest<void>(`/api/v1/vpcs/${encodeURIComponent(vpcId)}`, {
    method: "DELETE",
  });
}

export async function createFloatingIp(input: {
  is_ddos_guard: boolean;
  availability_zone: string;
}): Promise<TimewebFloatingIp> {
  const data = await timewebRequest<{ ip: TimewebFloatingIp }>(
    "/api/v1/floating-ips",
    { method: "POST", body: input },
  );
  return data.ip;
}

export async function fetchFloatingIp(ipId: string): Promise<TimewebFloatingIp> {
  const data = await timewebRequest<{ ip: TimewebFloatingIp }>(
    `/api/v1/floating-ips/${encodeURIComponent(ipId)}`,
  );
  return data.ip;
}

export async function deleteFloatingIp(ipId: string): Promise<void> {
  await timewebRequest<void>(
    `/api/v1/floating-ips/${encodeURIComponent(ipId)}`,
    { method: "DELETE" },
  );
}

export async function bindFloatingIp(
  ipId: string,
  resourceType: "server" | "balancer" | "database" | "network",
  resourceId: string | number,
): Promise<void> {
  await timewebRequest<void>(
    `/api/v1/floating-ips/${encodeURIComponent(ipId)}/bind`,
    {
      method: "POST",
      body: {
        resource_type: resourceType,
        resource_id:
          typeof resourceId === "number" || /^\d+$/.test(resourceId)
            ? Number(resourceId)
            : resourceId,
      },
    },
  );
}

export async function unbindFloatingIp(ipId: string): Promise<void> {
  await timewebRequest<void>(
    `/api/v1/floating-ips/${encodeURIComponent(ipId)}/unbind`,
    { method: "POST" },
  );
}

export async function createRouter(input: {
  name: string;
  preset_id: number;
  project_id: number;
  comment?: string;
}): Promise<TimewebRouter> {
  const data = await timewebRequest<{ router: TimewebRouter }>(
    "/api/v1/routers",
    { method: "POST", body: input, timeoutMs: 15_000 },
  );
  return data.router;
}

export async function fetchRouter(routerId: string): Promise<TimewebRouter> {
  const data = await timewebRequest<{ router: TimewebRouter }>(
    `/api/v1/routers/${encodeURIComponent(routerId)}`,
  );
  return data.router;
}

export async function deleteRouter(routerId: string): Promise<void> {
  await timewebRequest<void>(
    `/api/v1/routers/${encodeURIComponent(routerId)}`,
    { method: "DELETE" },
  );
}

export async function createNetworkDrive(input: {
  name: string;
  size: number;
  preset_id: number;
  comment?: string;
}): Promise<TimewebNetworkDrive> {
  const data = await timewebRequest<{ network_drive: TimewebNetworkDrive }>(
    "/api/v1/network-drives",
    { method: "POST", body: input, timeoutMs: 15_000 },
  );
  return data.network_drive;
}

export async function fetchNetworkDrive(
  driveId: number | string,
): Promise<TimewebNetworkDrive> {
  const data = await timewebRequest<{ network_drive: TimewebNetworkDrive }>(
    `/api/v1/network-drives/${encodeURIComponent(String(driveId))}`,
  );
  return data.network_drive;
}

export async function deleteNetworkDrive(
  driveId: number | string,
): Promise<void> {
  await timewebRequest<void>(
    `/api/v1/network-drives/${encodeURIComponent(String(driveId))}`,
    { method: "DELETE" },
  );
}

export async function mountNetworkDrive(
  driveId: number | string,
  serverId: number,
): Promise<void> {
  await timewebRequest<void>(
    `/api/v1/network-drives/${encodeURIComponent(String(driveId))}/mount`,
    { method: "POST", body: { resource_type: "server", resource_id: serverId } },
  );
}

export async function unmountNetworkDrive(
  driveId: number | string,
): Promise<void> {
  await timewebRequest<void>(
    `/api/v1/network-drives/${encodeURIComponent(String(driveId))}/unmount`,
    { method: "POST" },
  );
}

// === CDN ===

export async function createCdnResource(input: {
  name: string;
  preset_id: number;
  project_id: number;
  storage_id?: number;
  server?: { host: string; port: number };
  use_https?: boolean;
  delivery_domain?: string;
  description?: string;
}): Promise<TimewebCdnResource> {
  const data = await timewebRequest<{ http_resource: TimewebCdnResource }>(
    "/api/v1/cdn/http-resources",
    { method: "POST", body: input, timeoutMs: 15_000 },
  );
  return data.http_resource;
}

export async function fetchCdnResource(
  resourceId: string,
): Promise<TimewebCdnResource> {
  const data = await timewebRequest<{ http_resource: TimewebCdnResource }>(
    `/api/v1/cdn/http-resources/${encodeURIComponent(resourceId)}`,
  );
  return data.http_resource;
}

export async function deleteCdnResource(resourceId: string): Promise<void> {
  await timewebRequest<void>(
    `/api/v1/cdn/http-resources/${encodeURIComponent(resourceId)}`,
    { method: "DELETE" },
  );
}

export async function clearCdnCache(resourceId: string): Promise<void> {
  await timewebRequest<void>(
    `/api/v1/cdn/http-resources/${encodeURIComponent(resourceId)}/clear-cache`,
    { method: "POST" },
  );
}

export async function suspendCdnResource(resourceId: string): Promise<void> {
  await timewebRequest<void>(
    `/api/v1/cdn/http-resources/${encodeURIComponent(resourceId)}/suspend`,
    { method: "POST" },
  );
}

export async function resumeCdnResource(resourceId: string): Promise<void> {
  await timewebRequest<void>(
    `/api/v1/cdn/http-resources/${encodeURIComponent(resourceId)}/resume`,
    { method: "POST" },
  );
}

export async function issueCdnCertificate(resourceId: string): Promise<void> {
  await timewebRequest<void>("/api/v1/cdn/certificates/issue", {
    method: "POST",
    body: { resource_id: resourceId },
    timeoutMs: 12_000,
  });
}

// === Corporate Domain Mail ===

export async function listDomainMailboxes(
  fqdn: string,
): Promise<TimewebMailbox[]> {
  const data = await timewebRequest<{ mailboxes: TimewebMailbox[] }>(
    `/api/v1/mail/domains/${encodeURIComponent(fqdn)}`,
  );
  return Array.isArray(data.mailboxes) ? data.mailboxes : [];
}

export async function createDomainMailbox(
  fqdn: string,
  input: {
    mailbox: string;
    password: string;
    owner_full_name?: string;
    comment?: string;
  },
): Promise<TimewebMailbox> {
  const data = await timewebRequest<{ mailbox: TimewebMailbox }>(
    `/api/v2/mail/domains/${encodeURIComponent(fqdn)}`,
    { method: "POST", body: input },
  );
  return data.mailbox;
}

export async function updateDomainMailbox(
  fqdn: string,
  mailbox: string,
  input: {
    password?: string;
    owner_full_name?: string;
    comment?: string;
  },
): Promise<TimewebMailbox> {
  const data = await timewebRequest<{ mailbox: TimewebMailbox }>(
    `/api/v2/mail/domains/${encodeURIComponent(fqdn)}/mailboxes/${encodeURIComponent(mailbox)}`,
    { method: "PATCH", body: input },
  );
  return data.mailbox;
}

export async function deleteDomainMailbox(
  fqdn: string,
  mailbox: string,
): Promise<void> {
  await timewebRequest<void>(
    `/api/v1/mail/domains/${encodeURIComponent(fqdn)}/mailboxes/${encodeURIComponent(mailbox)}`,
    { method: "DELETE" },
  );
}

