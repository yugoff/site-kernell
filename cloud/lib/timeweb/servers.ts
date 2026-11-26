import "server-only";
import { timewebRequest } from "./client";
import type {
  TimewebCreateServerInput,
  TimewebProject,
  TimewebServer,
  TimewebServerAction,
  TimewebServerDisk,
  TimewebServerIp,
  TimewebSshKey,
  TimewebUpdateServerInput,
} from "./types";

export async function createTimewebProject(
  name: string,
  description?: string,
): Promise<TimewebProject> {
  const data = await timewebRequest<{ project: TimewebProject }>(
    "/api/v1/projects",
    {
      method: "POST",
      body: { name, ...(description ? { description } : {}) },
      timeoutMs: 10_000,
    },
  );
  return data.project;
}

export async function createTimewebServer(
  input: TimewebCreateServerInput,
): Promise<TimewebServer> {
  const data = await timewebRequest<{ server: TimewebServer }>(
    "/api/v1/servers",
    { method: "POST", body: input, timeoutMs: 15_000 },
  );
  return data.server;
}

export async function fetchTimewebServer(
  serverId: number | string,
): Promise<TimewebServer> {
  const data = await timewebRequest<{ server: TimewebServer }>(
    `/api/v1/servers/${encodeURIComponent(String(serverId))}`,
  );
  return data.server;
}

export async function updateTimewebServer(
  serverId: number | string,
  input: TimewebUpdateServerInput,
): Promise<TimewebServer> {
  const data = await timewebRequest<{ server: TimewebServer }>(
    `/api/v1/servers/${encodeURIComponent(String(serverId))}`,
    { method: "PATCH", body: input, timeoutMs: 12_000 },
  );
  return data.server;
}

export async function deleteTimewebServer(
  serverId: number | string,
): Promise<{ hash?: string; is_moved_in_quarantine?: boolean }> {
  const data = await timewebRequest<{
    server_delete?: { hash?: string; is_moved_in_quarantine?: boolean };
  }>(`/api/v1/servers/${encodeURIComponent(String(serverId))}`, {
    method: "DELETE",
    timeoutMs: 12_000,
  });
  return data?.server_delete ?? {};
}

export async function runTimewebServerAction(
  serverId: number | string,
  action: TimewebServerAction,
): Promise<void> {
  await timewebRequest<void>(
    `/api/v1/servers/${encodeURIComponent(String(serverId))}/action`,
    { method: "POST", body: { action }, timeoutMs: 12_000 },
  );
}

export async function resetTimewebServerPassword(
  serverId: number | string,
): Promise<void> {
  await timewebRequest<void>(
    `/api/v1/servers/${encodeURIComponent(String(serverId))}/reset-password`,
    { method: "POST", timeoutMs: 12_000 },
  );
}

export async function fetchTimewebServerDisks(
  serverId: number | string,
): Promise<TimewebServerDisk[]> {
  const data = await timewebRequest<{ server_disks: TimewebServerDisk[] }>(
    `/api/v1/servers/${encodeURIComponent(String(serverId))}/disks`,
  );
  return Array.isArray(data.server_disks) ? data.server_disks : [];
}

export async function createTimewebServerDisk(
  serverId: number | string,
  sizeMb: number,
): Promise<TimewebServerDisk> {
  const data = await timewebRequest<{ server_disk: TimewebServerDisk }>(
    `/api/v1/servers/${encodeURIComponent(String(serverId))}/disks`,
    { method: "POST", body: { size: sizeMb }, timeoutMs: 12_000 },
  );
  return data.server_disk;
}

export async function fetchTimewebServerIps(
  serverId: number | string,
): Promise<TimewebServerIp[]> {
  const data = await timewebRequest<{ server_ips: TimewebServerIp[] }>(
    `/api/v1/servers/${encodeURIComponent(String(serverId))}/ips`,
  );
  return Array.isArray(data.server_ips) ? data.server_ips : [];
}

export async function listTimewebSshKeys(): Promise<TimewebSshKey[]> {
  const data = await timewebRequest<{ "ssh-keys": TimewebSshKey[] }>(
    "/api/v1/ssh-keys?limit=100",
  );
  return Array.isArray(data["ssh-keys"]) ? data["ssh-keys"] : [];
}

export async function createTimewebSshKey(
  name: string,
  body: string,
  isDefault = false,
): Promise<TimewebSshKey> {
  const data = await timewebRequest<{ "ssh-key": TimewebSshKey }>(
    "/api/v1/ssh-keys",
    {
      method: "POST",
      body: { name, body, is_default: isDefault },
      timeoutMs: 10_000,
    },
  );
  return data["ssh-key"];
}

export async function deleteTimewebSshKey(sshKeyId: number): Promise<void> {
  await timewebRequest<void>(`/api/v1/ssh-keys/${sshKeyId}`, {
    method: "DELETE",
  });
}

