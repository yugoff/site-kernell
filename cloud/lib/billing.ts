import "server-only";
import { randomUUID } from "node:crypto";
import { ApiError } from "./auth";
import type { User } from "./catalog";
import {
  db,
  ledgerBalanceKopecks,
  ledgerBalanceRub,
  logActivity,
  logAudit,
  transaction,
} from "./database";
import {
  YooKassaApiError,
  createYooKassaPayment,
  getYooKassaPayment,
  yookassaConfigured,
} from "./yookassa";
import { timewebToken } from "./timeweb";

const MIN_TOPUP_RUB = 100;
const MAX_TOPUP_RUB = 500_000;
const DAY_MS = 86_400_000;

type LocalPaymentRow = {
  id: string;
  user_id: string;
  provider: string;
  external_id: string | null;
  amount_kopecks: number;
  status: string;
  payload_json: string | null;
  request_key: string | null;
};

type LocalOrderRow = {
  id: string;
  user_id: string;
  title: string;
  amount: number;
  status: string;
  kind: string | null;
  cost_amount: number | null;
  retail_amount: number | null;
  provider_payload: string | null;
};

function publicOrigin(): string {
  return (process.env.CLOUD_ORIGIN || "https://cloud.kernell.ru").replace(
    /\/$/,
    "",
  );
}

/**
 * Creates or retrieves an idempotent YooKassa wallet top-up payment.
 */
export async function createWalletTopup(
  user: User,
  amountRub: number,
  requestKey: string,
) {
  if (user.demo) {
    throw new ApiError(400, "В демокабинете пополнение баланса недоступно.");
  }
  if (!user.emailVerified) {
    throw new ApiError(
      403,
      "Сначала подтвердите email в разделе «Настройки», чтобы пополнять баланс.",
    );
  }
  if (!yookassaConfigured()) {
    throw new ApiError(503, "Приём платежей через ЮKassa пока не настроен.");
  }
  if (
    !Number.isInteger(amountRub) ||
    amountRub < MIN_TOPUP_RUB ||
    amountRub > MAX_TOPUP_RUB
  ) {
    throw new ApiError(
      400,
      `Сумма пополнения должна быть от ${MIN_TOPUP_RUB} до ${MAX_TOPUP_RUB} ₽.`,
    );
  }
  if (!/^[\w-]{10,80}$/.test(requestKey)) {
    throw new ApiError(400, "Обновите страницу и повторите попытку.");
  }

  const existing = db()
    .prepare(
      "SELECT id,external_id,amount_kopecks,status,payload_json FROM payments WHERE user_id=? AND request_key=?",
    )
    .get(user.id, requestKey) as
    | Pick<
        LocalPaymentRow,
        "id" | "external_id" | "amount_kopecks" | "status" | "payload_json"
      >
    | undefined;

  if (existing && existing.status !== "failed") {
    let confirmationUrl: string | null = null;
    if (existing.payload_json) {
      try {
        const parsed = JSON.parse(existing.payload_json) as {
          confirmation?: { confirmation_url?: string };
        };
        confirmationUrl = parsed.confirmation?.confirmation_url ?? null;
      } catch {
        confirmationUrl = null;
      }
    }
    return {
      paymentId: existing.id,
      externalId: existing.external_id,
      status: existing.status,
      amountRub: Math.round(existing.amount_kopecks / 100),
      confirmationUrl,
    };
  }

  const paymentId = existing?.id ?? randomUUID();
  const amountKopecks = amountRub * 100;
  const nowIso = new Date().toISOString();

  if (!existing) {
    transaction(() => {
      db()
        .prepare(
          "INSERT INTO payments (id,user_id,provider,external_id,amount_kopecks,status,receipt_url,payload_json,created_at,updated_at,request_key) VALUES (?,?,'yookassa',NULL,?,'pending',NULL,NULL,?,?,?)",
        )
        .run(paymentId, user.id, amountKopecks, nowIso, nowIso, requestKey);
      logAudit(user.id, "billing.topup_initiated", "payment", paymentId, {
        amountRub,
      });
    });
  }

  try {
    const ykPayment = await createYooKassaPayment({
      paymentId,
      amountKopecks,
      customerEmail: user.email,
      returnUrl: `${publicOrigin()}/dashboard/billing?payment=${encodeURIComponent(paymentId)}`,
      description: `Пополнение баланса Kernell Cloud (${amountRub} ₽)`,
      idempotenceKey: requestKey,
    });

    db()
      .prepare(
        "UPDATE payments SET external_id=?,status=?,payload_json=?,updated_at=? WHERE id=?",
      )
      .run(
        ykPayment.id,
        ykPayment.status === "succeeded" ? "pending" : ykPayment.status,
        JSON.stringify(ykPayment),
        new Date().toISOString(),
        paymentId,
      );

    if (ykPayment.status === "succeeded" && ykPayment.paid === true) {
      await syncYooKassaPayment(ykPayment.id);
    }

    return {
      paymentId,
      externalId: ykPayment.id,
      status: ykPayment.status,
      amountRub,
      confirmationUrl: ykPayment.confirmation?.confirmation_url ?? null,
    };
  } catch (error) {
    db()
      .prepare("UPDATE payments SET status='failed',updated_at=? WHERE id=?")
      .run(new Date().toISOString(), paymentId);
    if (error instanceof YooKassaApiError) {
      throw new ApiError(
        error.statusCode === 503 ? 503 : 502,
        "Не удалось создать платёж в ЮKassa. Попробуйте ещё раз.",
      );
    }
    throw error;
  }
}

/**
 * Verifies authoritative payment state directly with YooKassa API and
 * credits the user's ledger atomically at most once.
 */
export async function syncYooKassaPayment(externalPaymentId: string) {
  const local = db()
    .prepare(
      "SELECT id,user_id,provider,external_id,amount_kopecks,status,payload_json,request_key FROM payments WHERE provider='yookassa' AND external_id=?",
    )
    .get(externalPaymentId) as LocalPaymentRow | undefined;

  if (!local) return { matched: false as const };
  if (local.status === "succeeded" || local.status === "canceled") {
    return {
      matched: true as const,
      paymentId: local.id,
      status: local.status,
      credited: false,
    };
  }

  const authoritative = await getYooKassaPayment(externalPaymentId);
  if (authoritative.id !== externalPaymentId) {
    throw new ApiError(400, "Несоответствие идентификатора платежа.");
  }

  const expectedRubMatch =
    authoritative.amount?.currency === "RUB" &&
    Math.round(Number(authoritative.amount.value) * 100) === local.amount_kopecks;
  const metaMatch =
    !authoritative.metadata?.payment_id ||
    authoritative.metadata.payment_id === local.id;

  if (!expectedRubMatch || !metaMatch) {
    logAudit(local.user_id, "billing.topup_mismatch", "payment", local.id, {
      externalPaymentId,
      value: authoritative.amount?.value,
    });
    throw new ApiError(400, "Параметры платежа не прошли сверку.");
  }

  const nowIso = new Date().toISOString();
  if (authoritative.status === "succeeded" && authoritative.paid === true) {
    const credited = transaction(() => {
      const updated = db()
        .prepare(
          "UPDATE payments SET status='succeeded',payload_json=?,updated_at=? WHERE id=? AND status!='succeeded'",
        )
        .run(JSON.stringify(authoritative), nowIso, local.id);

      if (updated.changes !== 1) return false;

      const amountRub = Math.round(local.amount_kopecks / 100);
      db()
        .prepare(
          "INSERT OR IGNORE INTO ledger_entries (id,user_id,direction,amount_kopecks,kind,reference_type,reference_id,idempotency_key,note,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
        )
        .run(
          randomUUID(),
          local.user_id,
          "credit",
          local.amount_kopecks,
          "topup",
          "payment",
          local.id,
          `yookassa:${authoritative.id}`,
          `Пополнение через ЮKassa (${amountRub} ₽)`,
          nowIso,
        );
      logActivity(local.user_id, `Баланс пополнен на ${amountRub} ₽`);
      logAudit(local.user_id, "billing.topup_succeeded", "payment", local.id, {
        externalId: authoritative.id,
        amountKopecks: local.amount_kopecks,
      });
      return true;
    });

    return {
      matched: true as const,
      paymentId: local.id,
      status: "succeeded",
      credited,
    };
  }

  if (authoritative.status === "canceled") {
    transaction(() => {
      const updated = db()
        .prepare(
          "UPDATE payments SET status='canceled',payload_json=?,updated_at=? WHERE id=? AND status!='succeeded' AND status!='canceled'",
        )
        .run(JSON.stringify(authoritative), nowIso, local.id);
      if (updated.changes === 1) {
        logAudit(local.user_id, "billing.topup_canceled", "payment", local.id, {
          externalId: authoritative.id,
          reason: authoritative.cancellation_details?.reason ?? null,
        });
      }
    });
  } else {
    db()
      .prepare(
        "UPDATE payments SET status=?,payload_json=?,updated_at=? WHERE id=? AND status='pending'",
      )
      .run(
        authoritative.status,
        JSON.stringify(authoritative),
        nowIso,
        local.id,
      );
  }

  return {
    matched: true as const,
    paymentId: local.id,
    status: authoritative.status,
    credited: false,
  };
}

export async function syncUserPaymentById(userId: string, paymentId: string) {
  const row = db()
    .prepare(
      "SELECT id,external_id,status FROM payments WHERE id=? AND user_id=?",
    )
    .get(paymentId, userId) as
    | { id: string; external_id: string | null; status: string }
    | undefined;
  if (!row) throw new ApiError(404, "Платёж не найден.");
  if (!row.external_id) {
    return { paymentId: row.id, status: row.status, credited: false };
  }
  return syncYooKassaPayment(row.external_id);
}

/**
 * Pays a draft order atomically from the user's wallet ledger and enqueues
 * provisioning + subscription records for execution.
 */
export function payOrderFromWallet(
  user: User,
  orderId: string,
  options: { personId?: string } = {},
) {
  if (user.demo) {
    throw new ApiError(
      400,
      "В демокабинете заказы не оплачиваются с реального баланса.",
    );
  }
  if (!user.emailVerified) {
    throw new ApiError(
      403,
      "Подтвердите email в разделе «Настройки» перед оплатой заказа.",
    );
  }

  return transaction(() => {
    const sql = db();
    const order = sql
      .prepare(
        "SELECT id,user_id,title,amount,status,kind,cost_amount,retail_amount,provider_payload FROM orders WHERE id=? AND user_id=?",
      )
      .get(orderId, user.id) as LocalOrderRow | undefined;

    if (!order) throw new ApiError(404, "Заказ не найден.");

    if (
      order.status === "paid" ||
      order.status === "provisioning" ||
      order.status === "active"
    ) {
      return {
        ok: true,
        orderId: order.id,
        status: order.status,
        alreadyPaid: true,
        jobId: null as string | null,
        balanceRub: ledgerBalanceRub(user.id),
      };
    }

    if (order.status !== "draft") {
      throw new ApiError(400, "Этот заказ нельзя оплатить в текущем статусе.");
    }

    let parsedPayload: Record<string, unknown> = {};
    if (order.provider_payload) {
      try {
        parsedPayload = JSON.parse(order.provider_payload) as Record<
          string,
          unknown
        >;
      } catch {
        parsedPayload = {};
      }
    }

    const kind = order.kind || (order.title.startsWith("Домен") ? "domain" : "vps");
    const action =
      parsedPayload.action === "prolong" || parsedPayload.action === "transfer"
        ? parsedPayload.action
        : "register";

    if (kind === "domain" && timewebToken() && action === "register") {
      let personId =
        options.personId?.trim() ||
        (typeof parsedPayload.personId === "string"
          ? parsedPayload.personId.trim()
          : "");
      if (!personId) {
        const latest = sql
          .prepare(
            "SELECT id FROM domain_persons WHERE user_id=? ORDER BY created_at DESC LIMIT 1",
          )
          .get(user.id) as { id: string } | undefined;
        personId = latest?.id ?? "";
      }
      if (!personId) {
        throw new ApiError(
          400,
          "Перед оплатой регистрации домена добавьте профиль администратора домена в разделе «Настройки».",
        );
      }
      const ownedPerson = sql
        .prepare("SELECT id FROM domain_persons WHERE id=? AND user_id=?")
        .get(personId, user.id) as { id: string } | undefined;
      if (!ownedPerson) {
        throw new ApiError(
          404,
          "Выбранный профиль администратора домена не найден.",
        );
      }
      parsedPayload.personId = personId;
    }

    const retailRub = order.retail_amount ?? order.amount;
    const retailKopecks = retailRub * 100;
    const costKopecks = (order.cost_amount ?? retailRub) * 100;
    if (retailKopecks <= 0) {
      throw new ApiError(400, "Некорректная сумма заказа.");
    }

    const balanceKopecks = ledgerBalanceKopecks(user.id);
    if (balanceKopecks < retailKopecks) {
      throw new ApiError(
        402,
        `Недостаточно средств на балансе. Требуется ${retailRub} ₽, доступно ${Math.round(balanceKopecks / 100)} ₽.`,
      );
    }

    const now = Date.now();
    const nowIso = new Date(now).toISOString();
    const years = Number(parsedPayload.years || 1);
    const period =
      kind === "domain"
        ? String(parsedPayload.period || "P1Y")
        : "P1M";
    const nextChargeAt =
      now + (kind === "domain" ? Math.max(1, years) * 365 : 30) * DAY_MS;

    sql
      .prepare(
        "INSERT INTO ledger_entries (id,user_id,direction,amount_kopecks,kind,reference_type,reference_id,idempotency_key,note,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
      )
      .run(
        randomUUID(),
        user.id,
        "debit",
        retailKopecks,
        "order_charge",
        "order",
        order.id,
        `order:${order.id}`,
        `Оплата заказа: ${order.title}`,
        nowIso,
      );

    const payloadJson =
      Object.keys(parsedPayload).length > 0
        ? JSON.stringify(parsedPayload)
        : order.provider_payload || JSON.stringify({ title: order.title });

    sql
      .prepare(
        "UPDATE orders SET status='paid',provider_payload=?,updated_at=? WHERE id=?",
      )
      .run(payloadJson, nowIso, order.id);

    const subscriptionId = randomUUID();
    sql
      .prepare(
        "INSERT INTO subscriptions (id,user_id,service_id,order_id,kind,title,period,cost_kopecks,retail_kopecks,status,next_charge_at,grace_until,auto_renew,created_at,updated_at) VALUES (?,?,NULL,?,?,?,?,?,?,'active',?,NULL,1,?,?)",
      )
      .run(
        subscriptionId,
        user.id,
        order.id,
        kind,
        order.title,
        period,
        costKopecks,
        retailKopecks,
        nextChargeAt,
        nowIso,
        nowIso,
      );

    const jobId = randomUUID();
    sql
      .prepare(
        "INSERT INTO provisioning_jobs (id,order_id,user_id,kind,payload_json,status,attempts,last_error,next_run_at,created_at,updated_at) VALUES (?,?,?,?,?,'queued',0,NULL,?,?,?)",
      )
      .run(
        jobId,
        order.id,
        user.id,
        kind,
        payloadJson,
        now,
        nowIso,
        nowIso,
      );

    logActivity(user.id, `Оплачен заказ: ${order.title} (${retailRub} ₽)`);
    logAudit(user.id, "order.paid", "order", order.id, {
      retailKopecks,
      subscriptionId,
      jobId,
      kind,
    });

    return {
      ok: true,
      orderId: order.id,
      status: "paid",
      alreadyPaid: false,
      jobId,
      balanceRub: ledgerBalanceRub(user.id),
    };
  });
}
