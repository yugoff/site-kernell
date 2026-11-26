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
import { db, logActivity, transaction } from "@cloud/lib/database";
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
    rateLimit(`orders:${user.id}`, 30);
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
    const orderId = transaction(() => {
      const previous = db()
        .prepare("SELECT id FROM orders WHERE user_id=? AND request_key=?")
        .get(user.id, key) as { id: string } | undefined;
      if (previous) return previous.id;
      const id = randomUUID();
      db()
        .prepare(
          "INSERT INTO orders (id,user_id,title,amount,created,status,request_key,kind,cost_amount,retail_amount,provider_payload,updated_at) VALUES (?,?,?,?,?,'draft',?,?,?,?,?,?)",
        )
        .run(
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
        );
      logActivity(user.id, `Сохранён заказ: ${spec.title}`);
      return id;
    });

    return Response.json({
      id: orderId,
      status: "draft",
      amount: spec.retailAmount,
      message: "Заказ сохранён. Его можно оплатить с баланса в разделе «Заказы».",
    });
  } catch (error) {
    return apiError(error);
  }
}

const DELETABLE_ORDER_STATUSES = new Set(["draft", "demo", "failed"]);

export async function DELETE(request: Request) {
  try {
    checkOrigin(request);
    const user = await apiUser();
    rateLimit(`orders-delete:${user.id}`, 30);
    const id = new URL(request.url).searchParams.get("id")?.trim() || "";
    if (!id || id.length > 80) throw new ApiError(400, "Укажите заказ.");

    transaction(() => {
      const existing = db()
        .prepare("SELECT id,title,status FROM orders WHERE id=? AND user_id=?")
        .get(id, user.id) as
        | { id: string; title: string; status: string }
        | undefined;
      if (!existing) throw new ApiError(404, "Заказ не найден.");
      if (!DELETABLE_ORDER_STATUSES.has(existing.status)) {
        throw new ApiError(
          409,
          "Оплаченный или выполняемый заказ нельзя удалить.",
        );
      }
      db()
        .prepare("DELETE FROM orders WHERE id=? AND user_id=?")
        .run(existing.id, user.id);
      logActivity(user.id, `Удалён заказ: ${existing.title}`);
    });

    return Response.json({ deleted: true, id });
  } catch (error) {
    return apiError(error);
  }
}
