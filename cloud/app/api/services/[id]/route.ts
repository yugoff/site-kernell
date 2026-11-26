import {
  ApiError,
  apiError,
  apiUser,
  checkOrigin,
  jsonBody,
  rateLimit,
} from "@cloud/lib/auth";
import type { ServiceKind } from "@cloud/lib/catalog";
import { getVpsCatalogData } from "@cloud/lib/catalog-service";
import { db, logActivity, logAudit, transaction } from "@cloud/lib/database";
import { handleInfraServiceAction } from "@cloud/lib/infra-actions";
import { syncServiceFromProvider } from "@cloud/lib/provisioning";
import {
  TimewebApiError,
  createTimewebServerDisk,
  deleteTimewebServer,
  patchDomainSettings,
  resetTimewebServerPassword,
  runTimewebServerAction,
  timewebToken,
  updateDomainNameServers,
  updateTimewebServer,
} from "@cloud/lib/timeweb";

export const runtime = "nodejs";

function validateNameservers(raw: unknown): string[] {
  if (!Array.isArray(raw) || raw.length < 2 || raw.length > 4) {
    throw new ApiError(400, "Укажите от 2 до 4 NS-серверов.");
  }
  const names = raw.map((item) => String(item).trim().toLowerCase());
  if (
    new Set(names).size !== names.length ||
    !names.every(
      (name) =>
        name.length < 254 &&
        name.split(".").length > 1 &&
        name
          .split(".")
          .every((label) =>
            /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label),
          ),
    )
  ) {
    throw new ApiError(400, "Проверьте имена NS-серверов.");
  }
  return names;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    checkOrigin(request);
    const user = await apiUser();
    const { id } = await context.params;
    const body = await jsonBody(request);
    rateLimit(`service:${user.id}`, 60);
    const service = db()
      .prepare(
        "SELECT id,name,kind,status,tw_resource_id,metadata_json FROM services WHERE id=? AND user_id=?",
      )
      .get(id, user.id) as
      | {
          id: string;
          name: string;
          kind: ServiceKind;
          status: string;
          tw_resource_id: string | null;
          metadata_json: string | null;
        }
      | undefined;
    if (!service) throw new ApiError(404, "Услуга не найдена.");

    const action = String(body.action || "");

    if (user.demo) {
      if (!["start", "stop", "restart", "renewal", "dns"].includes(action))
        throw new ApiError(400, "Неизвестное действие.");
      if (["start", "stop", "restart"].includes(action) && service.kind !== "vps")
        throw new ApiError(400, "Действие доступно только для сервера.");
      if (action === "restart" && service.status !== "running")
        throw new ApiError(400, "Сначала запустите сервер.");
      if (action === "renewal" && typeof body.enabled !== "boolean")
        throw new ApiError(400, "Проверьте настройку продления.");
      const dns =
        action === "dns"
          ? (() => {
              if (service.kind !== "domain")
                throw new ApiError(400, "Действие доступно только для домена.");
              return validateNameservers(body.nameservers).join("|");
            })()
          : "";

      transaction(() => {
        if (action === "start" || action === "stop")
          db()
            .prepare("UPDATE services SET status=? WHERE id=? AND user_id=?")
            .run(action === "start" ? "running" : "stopped", id, user.id);
        if (action === "renewal")
          db()
            .prepare("UPDATE services SET auto_renew=? WHERE id=? AND user_id=?")
            .run(body.enabled ? 1 : 0, id, user.id);
        if (action === "dns")
          db()
            .prepare("UPDATE services SET details=? WHERE id=? AND user_id=?")
            .run(dns, id, user.id);
        const verbs: Record<string, string> = {
          start: "Запуск",
          stop: "Остановка",
          restart: "Перезагрузка",
          renewal: "Изменение автопродления",
          dns: "Изменение NS-серверов",
        };
        logActivity(user.id, `${verbs[action]}: ${service.name} (демо)`);
      });
      return Response.json({
        ok: true,
        message: "Изменение сохранено в демокабинете.",
      });
    }

    if (!service.tw_resource_id || !timewebToken()) {
      throw new ApiError(
        503,
        "Управление этой услугой станет доступно после подключения к провайдеру.",
      );
    }

    if (action === "sync") {
      await syncServiceFromProvider(service.id, user.id);
      return Response.json({ ok: true, message: "Состояние обновлено." });
    }

    const twId = service.tw_resource_id;

    if (service.kind === "vps") {
      if (action === "start") {
        await runTimewebServerAction(twId, "start");
        db()
          .prepare("UPDATE services SET status='running' WHERE id=? AND user_id=?")
          .run(id, user.id);
        logActivity(user.id, `Запуск сервера ${service.name}`);
        logAudit(user.id, "vps.start", "service", id);
        return Response.json({ ok: true, message: "Команда запуска отправлена." });
      }

      if (action === "stop") {
        await runTimewebServerAction(
          twId,
          body.hard ? "hard_shutdown" : "shutdown",
        );
        db()
          .prepare("UPDATE services SET status='stopped' WHERE id=? AND user_id=?")
          .run(id, user.id);
        logActivity(user.id, `Остановка сервера ${service.name}`);
        logAudit(user.id, "vps.stop", "service", id, { hard: Boolean(body.hard) });
        return Response.json({ ok: true, message: "Сервер остановлен." });
      }

      if (action === "restart") {
        if (service.status !== "running") {
          throw new ApiError(400, "Сначала запустите сервер.");
        }
        await runTimewebServerAction(
          twId,
          body.hard ? "hard_reboot" : "reboot",
        );
        logActivity(user.id, `Перезагрузка сервера ${service.name}`);
        logAudit(user.id, "vps.restart", "service", id, { hard: Boolean(body.hard) });
        return Response.json({ ok: true, message: "Сервер перезагружается." });
      }

      if (action === "reset_password") {
        await resetTimewebServerPassword(twId);
        await syncServiceFromProvider(id, user.id).catch(() => null);
        logActivity(user.id, `Сброшен root-пароль сервера ${service.name}`);
        logAudit(user.id, "vps.password_reset", "service", id);
        return Response.json({
          ok: true,
          message: "Новый root-пароль сгенерирован и сохранён.",
        });
      }

      if (action === "reinstall") {
        if (body.confirm !== true) {
          throw new ApiError(400, "Подтвердите переустановку ОС.");
        }
        const osId = Number(body.osId);
        if (!Number.isInteger(osId) || osId <= 0) {
          throw new ApiError(400, "Выберите операционную систему.");
        }
        const catalog = await getVpsCatalogData();
        if (!catalog.operatingSystems.some((os) => os.id === osId)) {
          throw new ApiError(400, "Выбранная операционная система недоступна.");
        }
        const softwareId =
          typeof body.softwareId === "number" && body.softwareId > 0
            ? body.softwareId
            : undefined;
        await updateTimewebServer(twId, {
          os_id: osId,
          ...(softwareId ? { software_id: softwareId } : {}),
        });
        db()
          .prepare("UPDATE services SET status='reinstalling' WHERE id=? AND user_id=?")
          .run(id, user.id);
        await syncServiceFromProvider(id, user.id).catch(() => null);
        logActivity(user.id, `Запущена переустановка ОС на ${service.name}`);
        logAudit(user.id, "vps.reinstall", "service", id, { osId, softwareId });
        return Response.json({
          ok: true,
          message: "Переустановка операционной системы запущена.",
        });
      }

      if (action === "add_disk") {
        const sizeMb = Number(body.sizeMb);
        if (
          !Number.isInteger(sizeMb) ||
          sizeMb < 5120 ||
          sizeMb > 512000 ||
          sizeMb % 5120 !== 0
        ) {
          throw new ApiError(
            400,
            "Размер дополнительного диска должен быть от 5120 до 512000 МБ с шагом 5120.",
          );
        }
        await createTimewebServerDisk(twId, sizeMb);
        await syncServiceFromProvider(id, user.id).catch(() => null);
        logActivity(
          user.id,
          `Добавлен диск ${Math.round(sizeMb / 1024)} ГБ на ${service.name}`,
        );
        logAudit(user.id, "vps.disk_added", "service", id, { sizeMb });
        return Response.json({ ok: true, message: "Дополнительный диск добавлен." });
      }

      if (action === "renewal") {
        if (typeof body.enabled !== "boolean") {
          throw new ApiError(400, "Проверьте настройку продления.");
        }
        const flag = body.enabled ? 1 : 0;
        transaction(() => {
          db()
            .prepare("UPDATE services SET auto_renew=? WHERE id=? AND user_id=?")
            .run(flag, id, user.id);
          db()
            .prepare(
              "UPDATE subscriptions SET auto_renew=?,updated_at=? WHERE service_id=? AND user_id=?",
            )
            .run(flag, new Date().toISOString(), id, user.id);
          logActivity(
            user.id,
            `Изменение автопродления сервера ${service.name}`,
          );
        });
        return Response.json({
          ok: true,
          message: body.enabled
            ? "Автопродление включено."
            : "Автопродление выключено.",
        });
      }

      if (action === "delete") {
        if (body.confirm !== true) {
          throw new ApiError(400, "Подтвердите удаление сервера.");
        }
        try {
          await deleteTimewebServer(twId);
        } catch (error) {
          if (!(error instanceof TimewebApiError && error.statusCode === 404)) {
            throw new ApiError(502, "Не удалось удалить сервер у провайдера.");
          }
        }
        const nowIso = new Date().toISOString();
        transaction(() => {
          db()
            .prepare(
              "UPDATE subscriptions SET status='terminated',updated_at=? WHERE service_id=? AND user_id=?",
            )
            .run(nowIso, id, user.id);
          db()
            .prepare("DELETE FROM services WHERE id=? AND user_id=?")
            .run(id, user.id);
          logActivity(user.id, `Удалён сервер ${service.name}`);
          logAudit(user.id, "vps.deleted", "service", id, { twId });
        });
        return Response.json({ ok: true, deleted: true, message: "Сервер удалён." });
      }

      throw new ApiError(400, "Неизвестное действие для сервера.");
    }

    if (service.kind !== "domain") {
      return Response.json(
        await handleInfraServiceAction(user, service, action, body),
      );
    }

    // Domain service controls
    if (action === "dns") {
      const names = validateNameservers(body.nameservers);
      await updateDomainNameServers(
        twId,
        names.map((host) => ({ host })),
      );
      const joined = names.join("|");
      transaction(() => {
        db()
          .prepare("UPDATE services SET details=? WHERE id=? AND user_id=?")
          .run(joined, id, user.id);
        logActivity(user.id, `Обновлены NS-серверы для ${service.name}`);
        logAudit(user.id, "domain.ns_updated", "service", id, {
          nameservers: names,
        });
      });
      return Response.json({ ok: true, message: "NS-серверы обновлены." });
    }

    if (action === "renewal") {
      if (typeof body.enabled !== "boolean") {
        throw new ApiError(400, "Проверьте настройку продления.");
      }
      await patchDomainSettings(twId, { is_autoprolong_enabled: body.enabled });
      const flag = body.enabled ? 1 : 0;
      transaction(() => {
        db()
          .prepare("UPDATE services SET auto_renew=? WHERE id=? AND user_id=?")
          .run(flag, id, user.id);
        db()
          .prepare(
            "UPDATE subscriptions SET auto_renew=?,updated_at=? WHERE service_id=? AND user_id=?",
          )
          .run(flag, new Date().toISOString(), id, user.id);
        logActivity(user.id, `Изменение автопродления домена ${service.name}`);
        logAudit(user.id, "domain.renewal_updated", "service", id, {
          enabled: body.enabled,
        });
      });
      return Response.json({
        ok: true,
        message: body.enabled
          ? "Автопродление домена включено."
          : "Автопродление домена выключено.",
      });
    }

    throw new ApiError(400, "Неизвестное действие для домена.");
  } catch (error) {
    if (error instanceof TimewebApiError) {
      return apiError(
        new ApiError(
          error.statusCode >= 400 && error.statusCode < 500 ? error.statusCode : 502,
          error.message || "Ошибка при обращении к Timeweb Cloud.",
        ),
      );
    }
    return apiError(error);
  }
}
