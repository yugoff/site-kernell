import {
  ApiError,
  apiError,
  apiUser,
  checkOrigin,
  rateLimit,
} from "@cloud/lib/auth";
import { payOrderFromWallet } from "@cloud/lib/billing";
import { db, ledgerBalanceRub } from "@cloud/lib/database";
import { processSingleProvisioningJob } from "@cloud/lib/provisioning";
import { timewebToken } from "@cloud/lib/timeweb";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    checkOrigin(request);
    const user = await apiUser();
    rateLimit(`order-pay:${user.id}`, 30);
    const raw = await request.text();
    let parsed: Record<string, unknown> = {};
    if (raw.trim()) {
      let json: unknown;
      try {
        json = JSON.parse(raw);
      } catch {
        throw new ApiError(400, "Неверный формат запроса.");
      }
      if (!json || typeof json !== "object" || Array.isArray(json)) {
        throw new ApiError(400, "Неверный формат запроса.");
      }
      parsed = json as Record<string, unknown>;
    }
    const { id } = await context.params;
    const personId =
      typeof parsed.personId === "string" ? parsed.personId : undefined;
    const result = payOrderFromWallet(user, id, { personId });

    if (!result.alreadyPaid && result.jobId && timewebToken()) {
      const outcome = await processSingleProvisioningJob(result.jobId);
      const currentOrder = db()
        .prepare("SELECT status FROM orders WHERE id=? AND user_id=?")
        .get(id, user.id) as { status: string } | undefined;

      if ("ok" in outcome && !outcome.ok && !outcome.retryScheduled) {
        throw new ApiError(400, outcome.error || "Не удалось выполнить заказ.");
      }

      return Response.json(
        {
          ok: true,
          orderId: result.orderId,
          status: currentOrder?.status || result.status,
          alreadyPaid: false,
          serviceId: "serviceId" in outcome ? outcome.serviceId : null,
          balanceRub: ledgerBalanceRub(user.id),
        },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    }

    return Response.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}

