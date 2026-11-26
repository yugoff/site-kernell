import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import type { Service, ServiceKind } from "./catalog";
import {
  db,
  logActivity,
  logAudit,
  saveServiceCredentials,
  transaction,
  type StoredServiceCredentials,
} from "./database";
import {
  createBalancer,
  createCdnResource,
  createDatabaseCluster,
  createFloatingIp,
  createK8sCluster,
  createNetworkDrive,
  createRouter,
  createStorageBucket,
  fetchBalancer,
  fetchCdnResource,
  fetchDatabaseCluster,
  fetchFloatingIp,
  fetchK8sCluster,
  fetchK8sKubeconfig,
  fetchNetworkDrive,
  fetchRouter,
  fetchStorageBucket,
} from "./timeweb";

export type InfraJobContext = {
  jobId: string;
  orderId: string;
  userId: string;
  userName: string;
  kind: ServiceKind;
  retailAmount: number;
  costAmount: number;
  payload: Record<string, unknown>;
  ensureUserTimewebProject: (
    userId: string,
    userName: string,
  ) => Promise<number>;
  persistPayloadProgress: (
    jobId: string,
    orderId: string,
    payload: Record<string, unknown>,
  ) => void;
};

function mapUpstreamStatus(raw: string | undefined): Service["status"] {
  const s = (raw || "").toLowerCase();
  if (s === "on" || s === "started" || s === "running") return "running";
  if (s === "created" || s === "active" || s === "ready" || s === "paid") {
    return "active";
  }
  if (s === "off" || s === "stopped" || s === "blocked" || s === "no_paid") {
    return "stopped";
  }
  if (s === "failed" || s === "error") return "error";
  return "provisioning";
}

function dbIpAddress(
  networks?: Array<{ type: string; ips?: Array<{ type: string; ip: string | null }> }>,
): string {
  for (const net of networks ?? []) {
    if (net.type !== "public" || !Array.isArray(net.ips)) continue;
    const v4 = net.ips.find((item) => item.ip);
    if (v4?.ip) return v4.ip;
  }
  return "";
}

function finalizeProvisionedService(params: {
  ctx: InfraJobContext;
  twResourceId: string;
  twProjectId: number | null;
  name: string;
  status: Service["status"];
  details: string;
  address: string;
  metadata: Record<string, unknown>;
  credentials?: StoredServiceCredentials;
  activityMessage: string;
}) {
  const { ctx } = params;
  const renewalIso = new Date(Date.now() + 30 * 86_400_000).toISOString();
  const isReady = params.status === "running" || params.status === "active";
  let serviceId = "";

  transaction(() => {
    const sql = db();
    const existing = sql
      .prepare(
        "SELECT id FROM services WHERE user_id=? AND kind=? AND tw_resource_id=?",
      )
      .get(ctx.userId, ctx.kind, params.twResourceId) as
      | { id: string }
      | undefined;
    serviceId = existing?.id ?? randomUUID();

    if (existing) {
      sql
        .prepare(
          "UPDATE services SET status=?,details=?,address=?,tw_project_id=?,metadata_json=? WHERE id=? AND user_id=?",
        )
        .run(
          params.status,
          params.details,
          params.address,
          params.twProjectId,
          JSON.stringify(params.metadata),
          serviceId,
          ctx.userId,
        );
    } else {
      sql
        .prepare(
          "INSERT INTO services (id,user_id,kind,name,status,price,renewal,details,address,auto_renew,tw_resource_id,tw_project_id,cost_price,metadata_json) VALUES (?,?,?,?,?,?,?,?,?,1,?,?,?,?)",
        )
        .run(
          serviceId,
          ctx.userId,
          ctx.kind,
          params.name,
          params.status,
          ctx.retailAmount,
          renewalIso,
          params.details,
          params.address,
          params.twResourceId,
          params.twProjectId,
          ctx.costAmount,
          JSON.stringify(params.metadata),
        );
    }

    sql
      .prepare(
        "UPDATE subscriptions SET service_id=?,updated_at=? WHERE order_id=?",
      )
      .run(serviceId, new Date().toISOString(), ctx.orderId);
    sql
      .prepare("UPDATE orders SET status=?,updated_at=? WHERE id=?")
      .run(isReady ? "active" : "provisioning", new Date().toISOString(), ctx.orderId);
    sql
      .prepare(
        "UPDATE provisioning_jobs SET status='done',last_error=NULL,updated_at=? WHERE id=?",
      )
      .run(new Date().toISOString(), ctx.jobId);

    logActivity(ctx.userId, params.activityMessage);
    logAudit(ctx.userId, `${ctx.kind}.provisioned`, "service", serviceId, {
      orderId: ctx.orderId,
      twResourceId: params.twResourceId,
      status: params.status,
    });
  });

  if (params.credentials) {
    saveServiceCredentials(serviceId, ctx.userId, params.credentials);
  }

  return { serviceId, status: params.status };
}

export async function provisionInfraJob(ctx: InfraJobContext) {
  const { payload } = ctx;
  const existingTwId = payload.twResourceId ? String(payload.twResourceId) : null;

  if (ctx.kind === "database") {
    const projectId = await ctx.ensureUserTimewebProject(ctx.userId, ctx.userName);
    const adminLogin = String(payload.adminLogin || "kc_admin");
    const dbPassword =
      typeof payload.generatedPassword === "string"
        ? payload.generatedPassword
        : randomBytes(12).toString("base64url") + "A1!";
    if (!existingTwId && !payload.generatedPassword) {
      payload.generatedPassword = dbPassword;
      ctx.persistPayloadProgress(ctx.jobId, ctx.orderId, payload);
    }

    const cluster = existingTwId
      ? await fetchDatabaseCluster(existingTwId)
      : await createDatabaseCluster({
          name: String(payload.name),
          type: String(payload.dbType),
          preset_id: Number(payload.presetId),
          project_id: projectId,
          admin: { login: adminLogin, password: dbPassword },
          instance: { name: String(payload.instanceName || "default_db") },
          ...(typeof payload.availabilityZone === "string"
            ? { availability_zone: payload.availabilityZone }
            : {}),
        });

    if (!existingTwId) {
      payload.twResourceId = String(cluster.id);
      ctx.persistPayloadProgress(ctx.jobId, ctx.orderId, payload);
    }

    const host = dbIpAddress(cluster.networks);
    const status = mapUpstreamStatus(cluster.status);
    return finalizeProvisionedService({
      ctx,
      twResourceId: String(cluster.id),
      twProjectId: projectId,
      name: cluster.name,
      status,
      details: `${cluster.type} · ${cluster.cpu} vCPU · ${Math.round(cluster.ram / 1024)} ГБ RAM|${cluster.location}|Порт ${cluster.port}`,
      address: host ? `${host}:${cluster.port}` : "",
      metadata: {
        orderId: ctx.orderId,
        dbType: cluster.type,
        port: cluster.port,
        location: cluster.location,
        cpu: cluster.cpu,
        ramMb: cluster.ram,
        diskMb: cluster.disk,
      },
      credentials: {
        dbLogin: adminLogin,
        dbPassword,
        dbHost: host || null,
        dbPort: cluster.port,
      },
      activityMessage: `Создана база данных ${cluster.name} (${cluster.type})`,
    });
  }

  if (ctx.kind === "s3") {
    const projectId = await ctx.ensureUserTimewebProject(ctx.userId, ctx.userName);
    const bucket = existingTwId
      ? await fetchStorageBucket(existingTwId)
      : await createStorageBucket({
          name: String(payload.name),
          type: payload.bucketType === "public" ? "public" : "private",
          preset_id: Number(payload.presetId),
          project_id: projectId,
        });

    if (!existingTwId) {
      payload.twResourceId = String(bucket.id);
      ctx.persistPayloadProgress(ctx.jobId, ctx.orderId, payload);
    }

    const status = mapUpstreamStatus(bucket.status);
    return finalizeProvisionedService({
      ctx,
      twResourceId: String(bucket.id),
      twProjectId: projectId,
      name: bucket.name,
      status,
      details: `S3 ${bucket.type === "public" ? "Публичный" : "Приватный"} · ${bucket.storage_class || "hot"}|${bucket.location}|${bucket.hostname}`,
      address: bucket.hostname,
      metadata: {
        orderId: ctx.orderId,
        bucketType: bucket.type,
        hostname: bucket.hostname,
        location: bucket.location,
        presetId: bucket.preset_id,
      },
      credentials: {
        s3AccessKey: bucket.access_key,
        s3SecretKey: bucket.secret_key,
        s3Hostname: bucket.hostname,
      },
      activityMessage: `Создан S3-бакет ${bucket.name}`,
    });
  }

  if (ctx.kind === "k8s") {
    const projectId = await ctx.ensureUserTimewebProject(ctx.userId, ctx.userName);
    const cluster = existingTwId
      ? await fetchK8sCluster(existingTwId)
      : await createK8sCluster({
          name: String(payload.name),
          k8s_version: String(payload.k8sVersion),
          network_driver: String(payload.networkDriver),
          preset_id: Number(payload.presetId),
          project_id: projectId,
          is_ingress: payload.isIngress !== false,
          ...(typeof payload.availabilityZone === "string"
            ? { availability_zone: payload.availabilityZone }
            : {}),
          worker_groups: [
            {
              name: "workers",
              preset_id: Number(payload.workerPresetId ?? payload.presetId),
              node_count: Number(payload.workerCount ?? 1),
            },
          ],
        });

    if (!existingTwId) {
      payload.twResourceId = String(cluster.id);
      ctx.persistPayloadProgress(ctx.jobId, ctx.orderId, payload);
    }

    const status = mapUpstreamStatus(cluster.status);
    const kubeconfig =
      status === "running" || status === "active"
        ? await fetchK8sKubeconfig(cluster.id).catch(() => null)
        : null;

    return finalizeProvisionedService({
      ctx,
      twResourceId: String(cluster.id),
      twProjectId: projectId,
      name: cluster.name,
      status,
      details: `K8s ${cluster.k8s_version} · CNI ${cluster.network_driver}|${cluster.availability_zone || "ru-1"}|${cluster.cpu} vCPU / ${Math.round(cluster.ram / 1024)} ГБ`,
      address: "",
      metadata: {
        orderId: ctx.orderId,
        k8sVersion: cluster.k8s_version,
        networkDriver: cluster.network_driver,
        presetId: cluster.preset_id,
      },
      ...(kubeconfig ? { credentials: { kubeconfig } } : {}),
      activityMessage: `Создан Kubernetes-кластер ${cluster.name}`,
    });
  }

  if (ctx.kind === "balancer") {
    const projectId = await ctx.ensureUserTimewebProject(ctx.userId, ctx.userName);
    const balancer = existingTwId
      ? await fetchBalancer(existingTwId)
      : await createBalancer({
          name: String(payload.name),
          algo: payload.algo === "leastconn" ? "leastconn" : "roundrobin",
          proto: (String(payload.proto || "http") as
            | "http"
            | "http2"
            | "https"
            | "tcp"),
          port: Number(payload.port || 80),
          preset_id: Number(payload.presetId),
          project_id: projectId,
          is_ssl: Boolean(payload.isSsl),
        });

    if (!existingTwId) {
      payload.twResourceId = String(balancer.id);
      ctx.persistPayloadProgress(ctx.jobId, ctx.orderId, payload);
    }

    return finalizeProvisionedService({
      ctx,
      twResourceId: String(balancer.id),
      twProjectId: projectId,
      name: balancer.name,
      status: mapUpstreamStatus(balancer.status),
      details: `${balancer.proto.toUpperCase()}:${balancer.port} · ${balancer.algo}|${balancer.availability_zone || "msk-1"}|Балансировщик`,
      address: balancer.ip || "",
      metadata: {
        orderId: ctx.orderId,
        algo: balancer.algo,
        proto: balancer.proto,
        port: balancer.port,
      },
      activityMessage: `Создан балансировщик ${balancer.name}`,
    });
  }

  if (ctx.kind === "router") {
    const projectId = await ctx.ensureUserTimewebProject(ctx.userId, ctx.userName);
    const router = existingTwId
      ? await fetchRouter(existingTwId)
      : await createRouter({
          name: String(payload.name),
          preset_id: Number(payload.presetId),
          project_id: projectId,
        });

    if (!existingTwId) {
      payload.twResourceId = String(router.id);
      ctx.persistPayloadProgress(ctx.jobId, ctx.orderId, payload);
    }

    return finalizeProvisionedService({
      ctx,
      twResourceId: String(router.id),
      twProjectId: projectId,
      name: router.name,
      status: mapUpstreamStatus(router.status),
      details: `Облачный роутер|${router.zone || "ru-1"}|NAT и маршруты`,
      address: router.ips?.[0]?.ip || "",
      metadata: { orderId: ctx.orderId, zone: router.zone ?? null },
      activityMessage: `Создан облачный роутер ${router.name}`,
    });
  }

  if (ctx.kind === "network_drive") {
    const drive = existingTwId
      ? await fetchNetworkDrive(existingTwId)
      : await createNetworkDrive({
          name: String(payload.name),
          size: Number(payload.sizeGb),
          preset_id: Number(payload.presetId),
        });

    if (!existingTwId) {
      payload.twResourceId = String(drive.id);
      ctx.persistPayloadProgress(ctx.jobId, ctx.orderId, payload);
    }

    return finalizeProvisionedService({
      ctx,
      twResourceId: String(drive.id),
      twProjectId: null,
      name: drive.name,
      status: mapUpstreamStatus(drive.status),
      details: `Сетевой диск · ${drive.size} ГБ|Подключение к VPS|iSCSI / Ceph`,
      address: "",
      metadata: {
        orderId: ctx.orderId,
        sizeGb: drive.size,
        mountedToServerId: drive.resource_id ?? null,
      },
      activityMessage: `Создан сетевой диск ${drive.name} (${drive.size} ГБ)`,
    });
  }

  if (ctx.kind === "cdn") {
    const projectId = await ctx.ensureUserTimewebProject(ctx.userId, ctx.userName);
    const cdn = existingTwId
      ? await fetchCdnResource(existingTwId)
      : await createCdnResource({
          name: String(payload.name),
          preset_id: Number(payload.presetId),
          project_id: projectId,
          ...(typeof payload.storageTwId === "number"
            ? { storage_id: payload.storageTwId }
            : {
                server: {
                  host: String(payload.originHost),
                  port: Number(payload.originPort || 443),
                },
              }),
          use_https: payload.useHttps !== false,
          ...(typeof payload.deliveryDomain === "string"
            ? { delivery_domain: payload.deliveryDomain }
            : {}),
        });

    if (!existingTwId) {
      payload.twResourceId = String(cdn.id);
      ctx.persistPayloadProgress(ctx.jobId, ctx.orderId, payload);
    }

    return finalizeProvisionedService({
      ctx,
      twResourceId: String(cdn.id),
      twProjectId: projectId,
      name: cdn.name,
      status: mapUpstreamStatus(cdn.status),
      details: `CDN-ресурс|Глобальная сеть|${cdn.delivery_domain || cdn.origin_domain || "Кеширование"}`,
      address: cdn.delivery_domain || "",
      metadata: {
        orderId: ctx.orderId,
        deliveryDomain: cdn.delivery_domain ?? null,
        originDomain: cdn.origin_domain ?? null,
      },
      activityMessage: `Создан CDN-ресурс ${cdn.name}`,
    });
  }

  if (ctx.kind === "floating_ip") {
    const fip = existingTwId
      ? await fetchFloatingIp(existingTwId)
      : await createFloatingIp({
          is_ddos_guard: Boolean(payload.isDdosGuard),
          availability_zone: String(payload.availabilityZone || "msk-1"),
        });

    if (!existingTwId) {
      payload.twResourceId = String(fip.id);
      ctx.persistPayloadProgress(ctx.jobId, ctx.orderId, payload);
    }

    return finalizeProvisionedService({
      ctx,
      twResourceId: String(fip.id),
      twProjectId: null,
      name: fip.ip,
      status: "active",
      details: `Плавающий IP${fip.is_ddos_guard ? " · DDoS Guard" : ""}|${fip.availability_zone}|Публичный IPv4`,
      address: fip.ip,
      metadata: {
        orderId: ctx.orderId,
        availabilityZone: fip.availability_zone,
        isDdosGuard: fip.is_ddos_guard,
        boundResourceType: fip.resource_type ?? null,
        boundResourceId: fip.resource_id ?? null,
      },
      activityMessage: `Выделен плавающий IP ${fip.ip}`,
    });
  }

  throw new Error(`Unsupported infra kind: ${ctx.kind}`);
}

export async function syncInfraService(row: {
  id: string;
  user_id: string;
  kind: ServiceKind;
  name: string;
  status: string;
  details: string;
  address: string;
  tw_resource_id: string;
}, metadata: Record<string, unknown>) {
  let nextStatus: Service["status"] = mapUpstreamStatus(row.status);
  let nextAddress = row.address;
  let nextDetails = row.details;
  const nextMeta = { ...metadata };

  if (row.kind === "database") {
    const cluster = await fetchDatabaseCluster(row.tw_resource_id);
    nextStatus = mapUpstreamStatus(cluster.status);
    const host = dbIpAddress(cluster.networks);
    if (host) nextAddress = `${host}:${cluster.port}`;
    nextDetails = `${cluster.type} · ${cluster.cpu} vCPU · ${Math.round(cluster.ram / 1024)} ГБ RAM|${cluster.location}|Порт ${cluster.port}`;
    nextMeta.port = cluster.port;
    nextMeta.dbType = cluster.type;
  } else if (row.kind === "s3") {
    const bucket = await fetchStorageBucket(row.tw_resource_id);
    nextStatus = mapUpstreamStatus(bucket.status);
    nextAddress = bucket.hostname || nextAddress;
    nextDetails = `S3 ${bucket.type === "public" ? "Публичный" : "Приватный"} · ${bucket.storage_class || "hot"}|${bucket.location}|${bucket.hostname}`;
    nextMeta.bucketType = bucket.type;
    saveServiceCredentials(row.id, row.user_id, {
      s3AccessKey: bucket.access_key,
      s3SecretKey: bucket.secret_key,
      s3Hostname: bucket.hostname,
    });
  } else if (row.kind === "k8s") {
    const cluster = await fetchK8sCluster(row.tw_resource_id);
    nextStatus = mapUpstreamStatus(cluster.status);
    if (nextStatus === "running" || nextStatus === "active") {
      const kubeconfig = await fetchK8sKubeconfig(cluster.id).catch(() => null);
      if (kubeconfig) {
        saveServiceCredentials(row.id, row.user_id, { kubeconfig });
      }
    }
  } else if (row.kind === "balancer") {
    const bal = await fetchBalancer(row.tw_resource_id);
    nextStatus = mapUpstreamStatus(bal.status);
    if (bal.ip) nextAddress = bal.ip;
  } else if (row.kind === "router") {
    const router = await fetchRouter(row.tw_resource_id);
    nextStatus = mapUpstreamStatus(router.status);
    if (router.ips?.[0]?.ip) nextAddress = router.ips[0].ip;
  } else if (row.kind === "network_drive") {
    const drive = await fetchNetworkDrive(row.tw_resource_id);
    nextStatus = mapUpstreamStatus(drive.status);
    nextMeta.mountedToServerId = drive.resource_id ?? null;
  } else if (row.kind === "cdn") {
    const cdn = await fetchCdnResource(row.tw_resource_id);
    nextStatus = mapUpstreamStatus(cdn.status);
    if (cdn.delivery_domain) nextAddress = cdn.delivery_domain;
  } else if (row.kind === "floating_ip") {
    const fip = await fetchFloatingIp(row.tw_resource_id);
    nextStatus = "active";
    nextAddress = fip.ip || nextAddress;
    nextMeta.boundResourceType = fip.resource_type ?? null;
    nextMeta.boundResourceId = fip.resource_id ?? null;
  }

  transaction(() => {
    db()
      .prepare(
        "UPDATE services SET status=?,address=?,details=?,metadata_json=? WHERE id=?",
      )
      .run(nextStatus, nextAddress, nextDetails, JSON.stringify(nextMeta), row.id);
    if (
      typeof metadata.orderId === "string" &&
      (nextStatus === "running" || nextStatus === "active")
    ) {
      db()
        .prepare(
          "UPDATE orders SET status='active',updated_at=? WHERE id=? AND status='provisioning'",
        )
        .run(new Date().toISOString(), metadata.orderId);
    }
  });

  return { serviceId: row.id, status: nextStatus, address: nextAddress };
}

