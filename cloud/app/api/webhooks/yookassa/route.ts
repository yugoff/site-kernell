import { cloudSetting } from "@cloud/lib/settings";
import { ApiError, apiError, jsonBody, rateLimit } from "@cloud/lib/auth";
import { syncYooKassaPayment } from "@cloud/lib/billing";
import { isTrustedYooKassaIp, yookassaConfigured } from "@cloud/lib/yookassa";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    if (!yookassaConfigured()) {
      throw new ApiError(503, "ЮKassa не настроена.");
    }
    if (cloudSetting("YOOKASSA_VERIFY_WEBHOOK_IP") !== "false") {
      const ip = request.headers.get("cf-connecting-ip")?.trim() || null;
      if (!isTrustedYooKassaIp(ip)) {
        throw new ApiError(403, "Недоверенный источник уведомления.");
      }
    }
    await rateLimit("webhook:yookassa", 300, 60_000);

    const body = await jsonBody(request);
    const event = typeof body.event === "string" ? body.event : "";
    const object =
      body.object && typeof body.object === "object"
        ? (body.object as Record<string, unknown>)
        : null;
    const externalId = typeof object?.id === "string" ? object.id.trim() : "";

    if (!event || !externalId || externalId.length > 100) {
      throw new ApiError(400, "Некорректное уведомление ЮKassa.");
    }

    if (
      event === "payment.succeeded" ||
      event === "payment.canceled" ||
      event === "payment.waiting_for_capture"
    ) {
      await syncYooKassaPayment(externalId);
    }

    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}

