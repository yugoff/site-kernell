import { randomUUID } from "node:crypto";
import {
  ApiError,
  apiError,
  apiUser,
  checkOrigin,
  jsonBody,
  rateLimit,
} from "@cloud/lib/auth";
import type { ServiceKind } from "@cloud/lib/catalog";
import { activityStatement, batch, db } from "@cloud/lib/database";
import {
  resolveDomainOrderSpec,
  resolveInfraOrderSpec,
  resolveVpsOrderSpec,
} from "@cloud/lib/order-pricing";

export const runtime = "nodejs";
const PAID_INFRA_KINDS = new Set<ServiceKind>([
  "database",
  "s3",
  "k8s",
  "balancer",
  "router",
  "network_drive",
  "cdn",
  "floating_ip",
]);

export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const user = await apiUser();
    const body = await jsonBody(request);
    await rateLimit(`orders:${user.id}`, 30);
    const key = typeof body.requestKey === "string" ? body.requestKey : "";
    if (!/^[\w-]{10,80}$/.test(key))
      throw new ApiError(400, "Обновите форму заказа.");

    let spec;
    if (body.kind === "vps") {
      spec = await resolveVpsOrderSpec(user.id, body);
    } else if (body.kind === "domain") {
      spec = await resolveDomainOrderSpec(user.id, body);
    } else if (
      typeof body.kind === "string" &&
      PAID_INFRA_KINDS.has(body.kind as ServiceKind)
    ) {
      spec = await resolveInfraOrderSpec(
        user.id,
        body.kind as ServiceKind,
        body,
      );
    } else {
      throw new ApiError(400, "Выберите услугу.");
    }

    const nowIso = new Date().toISOString();
    const id = randomUUID();
    const [, , orderResult] = await batch(
      db()
        .prepare(
          "INSERT INTO orders (id,user_id,title,amount,created,status,request_key,kind,cost_amount,retail_amount,provider_payload,updated_at) VALUES (?,?,?,?,?,'draft',?,?,?,?,?,?) ON CONFLICT(user_id,request_key) DO NOTHING",
        )
        .bind(
          id,
          user.id,
          spec.title,
          spec.retailAmount,
          nowIso,
          key,
          spec.kind,
          spec.costAmount,
          spec.retailAmount,
          JSON.stringify(spec.payload),
          nowIso,
        ),
      activityStatement(user.id, `Сохранён заказ: ${spec.title}`, true),
      db().prepare("SELECT id,status,amount FROM orders WHERE user_id=? AND request_key=?")
        .bind(user.id, key),
    );
    const order = orderResult.results[0] as { id: string; status: string; amount: number };

    return Response.json({
      id: order.id,
      status: order.status,
      amount: order.amount,
      message: "Заказ сохранён. Его можно оплатить с баланса в разделе «Заказы».",
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    checkOrigin(request);
    const user = await apiUser();
    await rateLimit(`orders-delete:${user.id}`, 30);
    const id = new URL(request.url).searchParams.get("id")?.trim() || "";
    if (!id || id.length > 80) throw new ApiError(400, "Укажите заказ.");

    const [deleted, , existing] = await batch(
      db().prepare("DELETE FROM orders WHERE id=? AND user_id=? AND status IN ('draft','demo','failed')")
        .bind(id, user.id),
      activityStatement(user.id, "Удалён заказ", true),
      db().prepare("SELECT id FROM orders WHERE id=? AND user_id=?").bind(id, user.id),
    );
    if (!deleted.meta.changes) {
      if (!existing.results.length) throw new ApiError(404, "Заказ не найден.");
      throw new ApiError(409, "Оплаченный или выполняемый заказ нельзя удалить.");
    }

    return Response.json({ deleted: true, id });
  } catch (error) {
    return apiError(error);
  }
}
