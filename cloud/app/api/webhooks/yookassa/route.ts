import { ApiError, apiError, jsonBody, rateLimit } from "@cloud/lib/auth";
import { syncYooKassaPayment } from "@cloud/lib/billing";
import { isTrustedYooKassaIp, yookassaConfigured } from "@cloud/lib/yookassa";

export const runtime = "nodejs";

function extractClientIp(request: Request): string | null {
  const realIp = request.headers.get("x-real-ip");
  if (realIp?.trim()) return realIp.trim();
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded?.trim()) {
    return forwarded.split(",")[0]?.trim() || null;
  }
  return null;
}

export async function POST(request: Request) {
  try {
    if (!yookassaConfigured()) {
      throw new ApiError(503, "ЮKassa не настроена.");
    }
    if (process.env.YOOKASSA_VERIFY_WEBHOOK_IP === "true") {
      const ip = extractClientIp(request);
      if (!isTrustedYooKassaIp(ip)) {
        throw new ApiError(403, "Недоверенный источник уведомления.");
      }
    }
    rateLimit("webhook:yookassa", 300, 60_000);

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

