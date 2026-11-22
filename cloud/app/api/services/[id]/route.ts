import {
  ApiError,
  apiError,
  apiUser,
  checkOrigin,
  jsonBody,
  rateLimit,
} from "@cloud/lib/auth";
import { db, logActivity, transaction } from "@cloud/lib/database";
export const runtime = "nodejs";
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
        "SELECT id,name,kind,status FROM services WHERE id=? AND user_id=?",
      )
      .get(id, user.id) as
      { id: string; name: string; kind: string; status: string } | undefined;
    if (!service) throw new ApiError(404, "Услуга не найдена.");
    if (!user.demo)
      throw new ApiError(
        503,
        "Управление услугами станет доступно после запуска.",
      );
    const action = body.action;
    if (
      !["start", "stop", "restart", "renewal", "dns"].includes(String(action))
    )
      throw new ApiError(400, "Неизвестное действие.");
    if (
      ["start", "stop", "restart"].includes(String(action)) &&
      service.kind !== "vps"
    )
      throw new ApiError(400, "Действие доступно только для сервера.");
    if (action === "restart" && service.status !== "running")
      throw new ApiError(400, "Сначала запустите сервер.");
    if (action === "renewal" && typeof body.enabled !== "boolean")
      throw new ApiError(400, "Проверьте настройку продления.");
    let dns = "";
    if (action === "dns") {
      if (
        service.kind !== "domain" ||
        !Array.isArray(body.nameservers) ||
        body.nameservers.length < 2 ||
        body.nameservers.length > 4
      )
        throw new ApiError(400, "Укажите от 2 до 4 NS-серверов.");
      const names = body.nameservers.map((item) =>
        String(item).trim().toLowerCase(),
      );
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
      )
        throw new ApiError(400, "Проверьте имена NS-серверов.");
      dns = names.join("|");
    }
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
      logActivity(user.id, `${verbs[String(action)]}: ${service.name} (демо)`);
    });
    return Response.json({
      ok: true,
      message: "Изменение сохранено в демокабинете.",
    });
  } catch (error) {
    return apiError(error);
  }
}
