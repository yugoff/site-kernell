import "server-only";
import { isIPv4 } from "node:net";
import { ApiError } from "./auth";
import type { ServiceKind, User } from "./catalog";
import { db, logActivity, logAudit, batch, activityStatement, auditStatement } from "./database";
import { syncServiceFromProvider } from "./provisioning";
import {
  TimewebApiError,
  addBalancerIps,
  addK8sNodes,
  addStorageSubdomains,
  bindFloatingIp,
  clearCdnCache,
  createBalancerRule,
  createDatabaseAdmin,
  createDatabaseInstance,
  createFirewallRule,
  deleteBalancer,
  deleteBalancerRule,
  deleteCdnResource,
  deleteDatabaseCluster,
  deleteFirewallGroup,
  deleteFirewallRule,
  deleteFloatingIp,
  deleteK8sCluster,
  deleteNetworkDrive,
  deleteRouter,
  deleteStorageBucket,
  deleteVpc,
  fetchBalancer,
  fetchCdnResource,
  fetchDatabaseCluster,
  fetchFirewallGroup,
  fetchFloatingIp,
  fetchK8sCluster,
  fetchNetworkDrive,
  fetchRouter,
  fetchStorageBucket,
  fetchVpc,
  generateStorageCertificate,
  issueCdnCertificate,
  linkFirewallResource,
  listBalancerRules,
  listDatabaseAdmins,
  listDatabaseInstances,
  listFirewallRules,
  listK8sNodeGroups,
  mountNetworkDrive,
  removeK8sNodes,
  resumeCdnResource,
  runDatabaseAction,
  suspendCdnResource,
  unbindFloatingIp,
  unlinkFirewallResource,
  unmountNetworkDrive,
  updateStorageBucket,
} from "./timeweb";

export type LocalServiceRow = {
  id: string;
  name: string;
  kind: ServiceKind;
  status: string;
  tw_resource_id: string | null;
  metadata_json: string | null;
};

async function ownedUpstreamResource(
  userId: string,
  targetServiceId: unknown,
  allowedKinds: ServiceKind[],
) {
  const id = typeof targetServiceId === "string" ? targetServiceId.trim() : "";
  if (!id) throw new ApiError(400, "Выберите целевой ресурс.");
  const row = await db()
    .prepare(
      "SELECT id,kind,name,tw_resource_id,address FROM services WHERE id=? AND user_id=?",
    )
    .get(id, userId) as
    | {
        id: string;
        kind: ServiceKind;
        name: string;
        tw_resource_id: string | null;
        address: string;
      }
    | undefined;
  if (!row || !allowedKinds.includes(row.kind) || !row.tw_resource_id) {
    throw new ApiError(404, "Целевой ресурс не найден или ещё не создан.");
  }
  return { ...row, twResourceId: row.tw_resource_id };
}

async function listOwnedTargets(userId: string, kinds: ServiceKind[]) {
  return (await db()
    .prepare(
      `SELECT id,kind,name,address FROM services WHERE user_id=? AND tw_resource_id IS NOT NULL AND kind IN (${kinds.map(() => "?").join(",")}) ORDER BY kind,name`,
    )
    .all(userId, ...kinds))
    .map((row) => ({ ...row })) as Array<{
    id: string;
    kind: ServiceKind;
    name: string;
    address: string;
  }>;
}

async function deleteUpstreamResource(kind: ServiceKind, twId: string) {
  try {
    if (kind === "database") await deleteDatabaseCluster(twId);
    else if (kind === "s3") await deleteStorageBucket(twId);
    else if (kind === "k8s") await deleteK8sCluster(twId);
    else if (kind === "balancer") await deleteBalancer(twId);
    else if (kind === "firewall") await deleteFirewallGroup(twId);
    else if (kind === "vpc") await deleteVpc(twId);
    else if (kind === "floating_ip") await deleteFloatingIp(twId);
    else if (kind === "router") await deleteRouter(twId);
    else if (kind === "network_drive") await deleteNetworkDrive(twId);
    else if (kind === "cdn") await deleteCdnResource(twId);
  } catch (error) {
    if (!(error instanceof TimewebApiError && error.statusCode === 404)) {
      throw error;
    }
  }
}

async function removeLocalService(userId: string, service: LocalServiceRow) {
  const nowIso = new Date().toISOString();
  await batch(
    db()
      .prepare(
        "UPDATE subscriptions SET status='terminated',updated_at=? WHERE service_id=? AND user_id=?",
      )
      .bind(nowIso, service.id, userId),
    db()
      .prepare("DELETE FROM services WHERE id=? AND user_id=?")
      .bind(service.id, userId),
    activityStatement(userId, `Удалена услуга: ${service.name}`),
    auditStatement(userId, `${service.kind}.deleted`, "service", service.id, {
      twResourceId: service.tw_resource_id,
    }),
  );
}

export async function handleInfraServiceAction(
  user: User,
  service: LocalServiceRow,
  action: string,
  body: Record<string, unknown>,
) {
  const twId = service.tw_resource_id!;

  if (action === "renewal") {
    if (typeof body.enabled !== "boolean") {
      throw new ApiError(400, "Проверьте настройку продления.");
    }
    const flag = body.enabled ? 1 : 0;
    await batch(
      db()
        .prepare("UPDATE services SET auto_renew=? WHERE id=? AND user_id=?")
        .bind(flag, service.id, user.id),
      db()
        .prepare(
          "UPDATE subscriptions SET auto_renew=?,updated_at=? WHERE service_id=? AND user_id=?",
        )
        .bind(flag, new Date().toISOString(), service.id, user.id),
    );
    return {
      ok: true,
      message: body.enabled
        ? "Автопродление включено."
        : "Автопродление выключено.",
    };
  }

  if (action === "delete") {
    if (body.confirm !== true) {
      throw new ApiError(400, "Подтвердите удаление ресурса.");
    }
    await deleteUpstreamResource(service.kind, twId);
    await removeLocalService(user.id, service);
    return { ok: true, deleted: true, message: "Ресурс удалён." };
  }

  if (service.kind === "database") {
    if (action === "start" || action === "stop" || action === "restart") {
      const twAction =
        action === "start"
          ? "start"
          : action === "stop"
            ? "shutdown"
            : "reboot";
      await runDatabaseAction(twId, twAction);
      if (action === "start" || action === "stop") {
        await db()
          .prepare("UPDATE services SET status=? WHERE id=? AND user_id=?")
          .run(action === "start" ? "running" : "stopped", service.id, user.id);
      }
      await logActivity(user.id, `БД ${service.name}: ${twAction}`);
      return { ok: true, message: "Команда отправлена кластеру БД." };
    }
    if (action === "add_database") {
      const dbName = typeof body.name === "string" ? body.name.trim() : "";
      if (!/^[a-zA-Z_][a-zA-Z0-9_]{1,47}$/.test(dbName)) {
        throw new ApiError(400, "Имя базы данных: 2–48 латинских символов или _.");
      }
      await createDatabaseInstance(twId, { name: dbName });
      await logActivity(user.id, `Создана база ${dbName} в кластере ${service.name}`);
      return { ok: true, message: `База данных ${dbName} создана.` };
    }
    if (action === "add_admin") {
      const login = typeof body.login === "string" ? body.login.trim() : "";
      const password =
        typeof body.password === "string" ? body.password : "";
      if (!/^[a-zA-Z][a-zA-Z0-9_]{2,31}$/.test(login) || password.length < 8) {
        throw new ApiError(400, "Укажите логин и пароль (от 8 символов).");
      }
      await createDatabaseAdmin(twId, { login, password, for_all: true });
      await logActivity(user.id, `Добавлен пользователь БД ${login}`);
      return { ok: true, message: `Пользователь ${login} добавлен.` };
    }
  }

  if (service.kind === "s3") {
    if (action === "set_visibility") {
      const bucketType = body.bucketType === "public" ? "public" : "private";
      await updateStorageBucket(twId, { bucket_type: bucketType });
      await syncServiceFromProvider(service.id, user.id).catch(() => null);
      return {
        ok: true,
        message:
          bucketType === "public"
            ? "Бакет переведён в публичный доступ."
            : "Бакет переведён в приватный доступ.",
      };
    }
    if (action === "add_subdomain") {
      const subdomain =
        typeof body.subdomain === "string" ? body.subdomain.trim().toLowerCase() : "";
      if (!/^[a-z0-9.-]{3,253}$/.test(subdomain) || !subdomain.includes(".")) {
        throw new ApiError(400, "Укажите корректный поддомен (например, cdn.example.ru).");
      }
      await addStorageSubdomains(twId, [subdomain]);
      if (body.issueSsl) {
        await generateStorageCertificate(subdomain).catch(() => null);
      }
      return { ok: true, message: `Поддомен ${subdomain} привязан к бакету.` };
    }
  }

  if (service.kind === "k8s") {
    if (action === "scale") {
      const groupId = Number(body.groupId);
      const delta = Number(body.delta);
      if (!Number.isInteger(groupId) || !Number.isInteger(delta) || delta === 0 || Math.abs(delta) > 10) {
        throw new ApiError(400, "Укажите группу нод и изменение от -10 до +10.");
      }
      if (delta > 0) await addK8sNodes(twId, groupId, delta);
      else await removeK8sNodes(twId, groupId, Math.abs(delta));
      await logActivity(user.id, `Масштабирование K8s ${service.name} (${delta > 0 ? "+" : ""}${delta})`);
      return { ok: true, message: "Запрос на масштабирование нод отправлен." };
    }
  }

  if (service.kind === "balancer") {
    if (action === "add_rule") {
      const bProto = String(body.balancerProto || "http");
      const sProto = String(body.serverProto || "http");
      const bPort = Number(body.balancerPort);
      const sPort = Number(body.serverPort);
      if (!bPort || !sPort || bPort < 1 || bPort > 65535 || sPort < 1 || sPort > 65535) {
        throw new ApiError(400, "Укажите корректные порты (1–65535).");
      }
      await createBalancerRule(twId, {
        balancer_proto: bProto,
        balancer_port: bPort,
        server_proto: sProto,
        server_port: sPort,
      });
      return { ok: true, message: "Правило балансировки добавлено." };
    }
    if (action === "delete_rule") {
      const ruleId = Number(body.ruleId);
      if (!Number.isInteger(ruleId) || ruleId <= 0) {
        throw new ApiError(400, "Укажите ID правила.");
      }
      await deleteBalancerRule(twId, ruleId);
      return { ok: true, message: "Правило балансировки удалено." };
    }
    if (action === "add_target") {
      const target = await ownedUpstreamResource(user.id, body.targetServiceId, ["vps"]);
      if (!isIPv4(target.address)) {
        throw new ApiError(400, "У выбранного сервера ещё нет публичного IPv4.");
      }
      await addBalancerIps(twId, [target.address]);
      return { ok: true, message: `Сервер ${target.name} добавлен в балансировщик.` };
    }
  }

  if (service.kind === "firewall") {
    if (action === "add_rule") {
      const direction = body.direction === "egress" ? "egress" : "ingress";
      const protocol = ["tcp", "udp", "icmp"].includes(String(body.protocol))
        ? (String(body.protocol) as "tcp" | "udp" | "icmp")
        : "tcp";
      const cidr = typeof body.cidr === "string" ? body.cidr.trim() : "";
      if (!/^([0-9]{1,3}\.){3}[0-9]{1,3}(\/\d{1,2})?$/.test(cidr)) {
        throw new ApiError(400, "Укажите корректный IPv4/CIDR (например, 0.0.0.0/0).");
      }
      const port = typeof body.port === "string" && body.port.trim() ? body.port.trim() : undefined;
      await createFirewallRule(twId, { direction, protocol, cidr, ...(port ? { port } : {}) });
      return { ok: true, message: "Правило Firewall добавлено." };
    }
    if (action === "delete_rule") {
      const ruleId = typeof body.ruleId === "string" ? body.ruleId.trim() : "";
      if (!ruleId) throw new ApiError(400, "Укажите ID правила.");
      await deleteFirewallRule(twId, ruleId);
      return { ok: true, message: "Правило удалено." };
    }
    if (action === "link" || action === "unlink") {
      const target = await ownedUpstreamResource(user.id, body.targetServiceId, ["vps"]);
      if (action === "link") {
        await linkFirewallResource(twId, target.twResourceId, "server");
      } else {
        await unlinkFirewallResource(twId, target.twResourceId, "server");
      }
      await logAudit(user.id, `firewall.${action}`, "service", service.id, {
        targetServiceId: target.id,
      });
      return {
        ok: true,
        message:
          action === "link"
            ? `Группа привязана к ${target.name}.`
            : `Группа отвязана от ${target.name}.`,
      };
    }
  }

  if (service.kind === "floating_ip") {
    if (action === "bind") {
      const target = await ownedUpstreamResource(user.id, body.targetServiceId, [
        "vps",
        "balancer",
        "database",
        "vpc",
      ]);
      const typeMap: Record<string, "server" | "balancer" | "database" | "network"> = {
        vps: "server",
        balancer: "balancer",
        database: "database",
        vpc: "network",
      };
      await bindFloatingIp(twId, typeMap[target.kind], target.twResourceId);
      await syncServiceFromProvider(service.id, user.id).catch(() => null);
      return { ok: true, message: `Плавающий IP привязан к ${target.name}.` };
    }
    if (action === "unbind") {
      await unbindFloatingIp(twId);
      await syncServiceFromProvider(service.id, user.id).catch(() => null);
      return { ok: true, message: "Плавающий IP отвязан." };
    }
  }

  if (service.kind === "network_drive") {
    if (action === "mount") {
      const target = await ownedUpstreamResource(user.id, body.targetServiceId, ["vps"]);
      await mountNetworkDrive(twId, Number(target.twResourceId));
      await syncServiceFromProvider(service.id, user.id).catch(() => null);
      return { ok: true, message: `Диск подключён к ${target.name}.` };
    }
    if (action === "unmount") {
      await unmountNetworkDrive(twId);
      await syncServiceFromProvider(service.id, user.id).catch(() => null);
      return { ok: true, message: "Сетевой диск отмонтирован." };
    }
  }

  if (service.kind === "cdn") {
    if (action === "suspend") {
      await suspendCdnResource(twId);
      await db().prepare("UPDATE services SET status='stopped' WHERE id=?").run(service.id);
      return { ok: true, message: "Раздача CDN приостановлена." };
    }
    if (action === "resume") {
      await resumeCdnResource(twId);
      await db().prepare("UPDATE services SET status='active' WHERE id=?").run(service.id);
      return { ok: true, message: "Раздача CDN возобновлена." };
    }
    if (action === "clear_cache") {
      await clearCdnCache(twId);
      return { ok: true, message: "Очистка кеша CDN запущена." };
    }
    if (action === "issue_cert") {
      await issueCdnCertificate(twId);
      return { ok: true, message: "Запрос на выпуск Let's Encrypt сертификата отправлен." };
    }
  }

  throw new ApiError(400, "Неизвестное действие для данной услуги.");
}

export async function getInfraServiceDetails(
  userId: string,
  service: { id: string; kind: ServiceKind; tw_resource_id: string },
) {
  const twId = service.tw_resource_id;
  await syncServiceFromProvider(service.id, userId).catch(() => null);
  const credExists = Boolean(
    await db()
      .prepare(
        "SELECT service_id FROM service_credentials WHERE service_id=? AND user_id=?",
      )
      .get(service.id, userId),
  );

  if (service.kind === "database") {
    const [cluster, admins, instances] = await Promise.all([
      fetchDatabaseCluster(twId).catch(() => null),
      listDatabaseAdmins(twId).catch(() => []),
      listDatabaseInstances(twId).catch(() => []),
    ]);
    return {
      kind: "database",
      live: true,
      hasCredentials: credExists,
      cluster,
      admins,
      instances,
    };
  }
  if (service.kind === "s3") {
    const bucket = await fetchStorageBucket(twId).catch(() => null);
    return {
      kind: "s3",
      live: true,
      hasCredentials: credExists,
      bucket: bucket
        ? {
            id: bucket.id,
            name: bucket.name,
            type: bucket.type,
            status: bucket.status,
            location: bucket.location,
            hostname: bucket.hostname,
            storage_class: bucket.storage_class,
            object_amount: bucket.object_amount,
            disk_stats: bucket.disk_stats,
          }
        : null,
    };
  }
  if (service.kind === "k8s") {
    const [cluster, nodeGroups] = await Promise.all([
      fetchK8sCluster(twId).catch(() => null),
      listK8sNodeGroups(twId).catch(() => []),
    ]);
    return { kind: "k8s", live: true, hasCredentials: credExists, cluster, nodeGroups };
  }
  if (service.kind === "balancer") {
    const [balancer, rules] = await Promise.all([
      fetchBalancer(twId).catch(() => null),
      listBalancerRules(twId).catch(() => []),
    ]);
    return {
      kind: "balancer",
      live: true,
      balancer,
      rules,
      targets: await listOwnedTargets(userId, ["vps"]),
    };
  }
  if (service.kind === "firewall") {
    const [group, rules] = await Promise.all([
      fetchFirewallGroup(twId).catch(() => null),
      listFirewallRules(twId).catch(() => []),
    ]);
    return {
      kind: "firewall",
      live: true,
      group,
      rules,
      targets: await listOwnedTargets(userId, ["vps"]),
    };
  }
  if (service.kind === "vpc") {
    return { kind: "vpc", live: true, vpc: await fetchVpc(twId).catch(() => null) };
  }
  if (service.kind === "floating_ip") {
    return {
      kind: "floating_ip",
      live: true,
      floatingIp: await fetchFloatingIp(twId).catch(() => null),
      targets: await listOwnedTargets(userId, ["vps", "balancer", "database", "vpc"]),
    };
  }
  if (service.kind === "network_drive") {
    return {
      kind: "network_drive",
      live: true,
      drive: await fetchNetworkDrive(twId).catch(() => null),
      targets: await listOwnedTargets(userId, ["vps"]),
    };
  }
  if (service.kind === "cdn") {
    return {
      kind: "cdn",
      live: true,
      cdn: await fetchCdnResource(twId).catch(() => null),
    };
  }
  if (service.kind === "router") {
    return {
      kind: "router",
      live: true,
      router: await fetchRouter(twId).catch(() => null),
    };
  }
  return { kind: service.kind, live: true };
}

