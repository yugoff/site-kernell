import "server-only";
import { cloudSetting } from "./settings";
import { randomUUID } from "node:crypto";
import { ApiError } from "./auth";
import type { User } from "./catalog";
import {
  db,
  ledgerBalanceQuery,
  ledgerBalanceRub,
  logAudit,
  activityStatement,
  auditStatement,
  batch,
} from "./database";
import {
  YooKassaApiError,
  createYooKassaPayment,
  getYooKassaPayment,
  yookassaConfigured,
} from "./yookassa";
import { timewebToken } from "./timeweb";
import { salesEnabled } from "./sales";

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
  return (cloudSetting("CLOUD_ORIGIN") || "https://cloud.kernell.ru").replace(
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
  if (!salesEnabled()) throw new ApiError(503, "Приём платежей пока отключён.");
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

  const proposedId = randomUUID();
  const nowIso = new Date().toISOString();
  const [, , paymentRows] = await batch(
    db().prepare(`INSERT INTO payments (id,user_id,provider,external_id,amount_kopecks,status,receipt_url,payload_json,created_at,updated_at,request_key,provider_request_key)
      VALUES (?,?,'yookassa',NULL,?,'pending',NULL,NULL,?,?,?,?)
      ON CONFLICT(user_id,request_key) WHERE request_key IS NOT NULL DO NOTHING`)
      .bind(proposedId, user.id, amountRub * 100, nowIso, nowIso, requestKey, proposedId),
    auditStatement(user.id, "billing.topup_initiated", "payment", proposedId, { amountRub }, true),
    db().prepare("SELECT id,external_id,amount_kopecks,status,payload_json,provider_request_key FROM payments WHERE user_id=? AND request_key=?")
      .bind(user.id, requestKey),
  );
  const payment = paymentRows.results[0] as Pick<LocalPaymentRow,
    "id" | "external_id" | "amount_kopecks" | "status" | "payload_json"> & {
      provider_request_key: string | null;
    };
  const paymentId = payment.id;
  const amountKopecks = payment.amount_kopecks;
  const chargedRub = Math.round(amountKopecks / 100);
  if (payment.external_id) {
    let confirmationUrl: string | null = null;
    try {
      const parsed = JSON.parse(payment.payload_json || "{}") as {
        confirmation?: { confirmation_url?: string };
      };
      confirmationUrl = parsed.confirmation?.confirmation_url ?? null;
    } catch {
      // Always return the authoritative local payment even if a cached link is invalid.
    }
    return {
      paymentId,
      externalId: payment.external_id,
      status: payment.status,
      amountRub: chargedRub,
      confirmationUrl,
    };
  }

  try {
    const ykPayment = await createYooKassaPayment({
      paymentId,
      amountKopecks,
      customerEmail: user.email,
      returnUrl: `${publicOrigin()}/dashboard/billing?payment=${encodeURIComponent(paymentId)}`,
      description: `Пополнение баланса Kernell Cloud (${chargedRub} ₽)`,
      idempotenceKey: payment.provider_request_key ?? requestKey,
    });

    await db()
      .prepare(
        "UPDATE payments SET external_id=?,status=?,payload_json=?,updated_at=? WHERE id=? AND external_id IS NULL",
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
      amountRub: chargedRub,
      confirmationUrl: ykPayment.confirmation?.confirmation_url ?? null,
    };
  } catch (error) {
    await db()
      .prepare("UPDATE payments SET status='failed',updated_at=? WHERE id=? AND external_id IS NULL")
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
  if (!salesEnabled()) throw new ApiError(503, "Обработка платежей пока отключена.");
  const local = await db()
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
    await logAudit(local.user_id, "billing.topup_mismatch", "payment", local.id, {
      externalPaymentId,
      value: authoritative.amount?.value,
    });
    throw new ApiError(400, "Параметры платежа не прошли сверку.");
  }

  const nowIso = new Date().toISOString();
  if (authoritative.status === "succeeded" && authoritative.paid === true) {
    const amountRub = Math.round(local.amount_kopecks / 100);
    const [, entry] = await batch(
      db()
        .prepare(
          "UPDATE payments SET status='succeeded',payload_json=?,updated_at=? WHERE id=? AND status NOT IN ('succeeded','canceled')",
        )
        .bind(JSON.stringify(authoritative), nowIso, local.id),
      db()
        .prepare(
          "INSERT INTO ledger_entries (id,user_id,direction,amount_kopecks,kind,reference_type,reference_id,idempotency_key,note,created_at) SELECT ?,?,?,?,?,?,?,?,?,? WHERE changes()=1 ON CONFLICT(user_id,idempotency_key) DO NOTHING",
        )
        .bind(
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
        ),
      activityStatement(local.user_id, `Баланс пополнен на ${amountRub} ₽`, true),
      auditStatement(local.user_id, "billing.topup_succeeded", "payment", local.id, {
        externalId: authoritative.id,
        amountKopecks: local.amount_kopecks,
      }, true),
    );

    return {
      matched: true as const,
      paymentId: local.id,
      status: "succeeded",
      credited: entry.meta.changes === 1,
    };
  }

  if (authoritative.status === "canceled") {
    await batch(
      db()
        .prepare(
          "UPDATE payments SET status='canceled',payload_json=?,updated_at=? WHERE id=? AND status!='succeeded' AND status!='canceled'",
        )
        .bind(JSON.stringify(authoritative), nowIso, local.id),
      auditStatement(local.user_id, "billing.topup_canceled", "payment", local.id, {
          externalId: authoritative.id,
          reason: authoritative.cancellation_details?.reason ?? null,
      }, true),
    );
  } else {
    await db()
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
  const row = await db()
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
export async function payOrderFromWallet(
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
  if (!salesEnabled()) throw new ApiError(503, "Оплата заказов пока отключена.");

  const sql = db();
  const order = await sql
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
      balanceRub: await ledgerBalanceRub(user.id),
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
      const latest = await sql
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
    const ownedPerson = await sql
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

  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const years = Number(parsedPayload.years || 1);
  const period =
    kind === "domain"
      ? String(parsedPayload.period || "P1Y")
      : "P1M";
  const nextChargeAt =
    now + (kind === "domain" ? Math.max(1, years) * 365 : 30) * DAY_MS;

  const payloadJson = Object.keys(parsedPayload).length > 0
    ? JSON.stringify(parsedPayload)
    : order.provider_payload || JSON.stringify({ title: order.title });
  const personId = typeof parsedPayload.personId === "string" ? parsedPayload.personId : null;
  const subscriptionId = randomUUID();
  const jobId = randomUUID();
  // The guarded debit claims the current draft and checks the balance inside
  // the transaction. Every subsequent write depends on the previous write.
  const [debit, , , , , , current, balance] = await batch(
  sql
    .prepare(
      `INSERT INTO ledger_entries (id,user_id,direction,amount_kopecks,kind,reference_type,reference_id,idempotency_key,note,created_at)
       SELECT ?,?,?,?,?,?,?,?,?,?
       WHERE EXISTS (SELECT 1 FROM orders WHERE id=? AND user_id=? AND status='draft')
         AND (? IS NULL OR EXISTS (SELECT 1 FROM domain_persons WHERE id=? AND user_id=?))
         AND (${ledgerBalanceQuery}) >= ?
       ON CONFLICT(user_id,idempotency_key) DO NOTHING`,
    )
    .bind(
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
      order.id, user.id, personId, personId, user.id, user.id, retailKopecks,
    ),

  sql
    .prepare(
      "UPDATE orders SET status='paid',provider_payload=?,updated_at=? WHERE id=? AND changes()=1",
    )
    .bind(payloadJson, nowIso, order.id),

  sql
    .prepare(
      "INSERT INTO subscriptions (id,user_id,service_id,order_id,kind,title,period,cost_kopecks,retail_kopecks,status,next_charge_at,grace_until,auto_renew,created_at,updated_at) SELECT ?,?,NULL,?,?,?,?,?,?,'active',?,NULL,1,?,? WHERE changes()=1",
    )
    .bind(
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
    ),

  sql
    .prepare(
      "INSERT INTO provisioning_jobs (id,order_id,user_id,kind,payload_json,status,attempts,last_error,next_run_at,created_at,updated_at) SELECT ?,?,?,?,?,'queued',0,NULL,?,?,? WHERE changes()=1",
    )
    .bind(
      jobId,
      order.id,
      user.id,
      kind,
      payloadJson,
      now,
      nowIso,
      nowIso,
    ),

  activityStatement(user.id, `Оплачен заказ: ${order.title} (${retailRub} ₽)`, true),
  auditStatement(user.id, "order.paid", "order", order.id, {
    retailKopecks,
    subscriptionId,
    jobId,
    kind,
  }, true),
  sql.prepare("SELECT status FROM orders WHERE id=? AND user_id=?").bind(order.id, user.id),
  sql.prepare(ledgerBalanceQuery).bind(user.id),
  );
  const balanceKopecks = (balance.results[0] as { balance_kopecks: number }).balance_kopecks;
  const balanceRub = Math.round(balanceKopecks / 100);
  if (debit.meta.changes !== 1) {
    const status = (current.results[0] as { status: string } | undefined)?.status;
    if (!status) throw new ApiError(404, "Заказ не найден.");
    if (status === "paid" || status === "provisioning" || status === "active") {
      return { ok: true, orderId: order.id, status, alreadyPaid: true, jobId: null, balanceRub };
    }
    if (status !== "draft") throw new ApiError(400, "Этот заказ нельзя оплатить в текущем статусе.");
    if (balanceKopecks < retailKopecks) {
      throw new ApiError(402, `Недостаточно средств на балансе. Требуется ${retailRub} ₽, доступно ${balanceRub} ₽.`);
    }
    throw new ApiError(409, "Заказ изменился. Проверьте настройки и повторите попытку.");
  }

  return {
    ok: true,
    orderId: order.id,
    status: "paid",
    alreadyPaid: false,
    jobId,
    balanceRub,
  };
}
