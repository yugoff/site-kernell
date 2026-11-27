import { cloudSetting } from "@cloud/lib/settings";
import { timingSafeEqual } from "node:crypto";
import { ApiError, apiError, jsonBody, rateLimit } from "@cloud/lib/auth";
import { db, logAudit } from "@cloud/lib/database";
import { syncServiceFromProvider } from "@cloud/lib/provisioning";
import { timewebToken } from "@cloud/lib/timeweb";

export const runtime = "nodejs";

function verifyTimewebWebhookSecret(request: Request): void {
  const expected = cloudSetting("TIMEWEB_WEBHOOK_SECRET")?.trim();
  if (!expected) {
    throw new ApiError(503, "TIMEWEB_WEBHOOK_SECRET is not configured.");
  }
  const auth = request.headers.get("authorization") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const headerSecret = request.headers.get("x-webhook-secret")?.trim() || "";
  const candidate = bearer || headerSecret;

  const expectedBuf = Buffer.from(expected, "utf8");
  const candidateBuf = Buffer.from(candidate, "utf8");
  if (
    expectedBuf.length !== candidateBuf.length ||
    !timingSafeEqual(expectedBuf, candidateBuf)
  ) {
    throw new ApiError(403, "Invalid webhook signature.");
  }
}

export async function POST(request: Request) {
  try {
    verifyTimewebWebhookSecret(request);
    await rateLimit("webhooks:timeweb", 180, 60_000);
    const payload = await jsonBody(request);

    const resourceIdRaw =
      payload.server_id ??
      payload.fqdn ??
      payload.resource_id ??
      (typeof payload.data === "object" && payload.data
        ? (payload.data as Record<string, unknown>).id
        : undefined) ??
      payload.id;

    if (!resourceIdRaw) {
      return Response.json({ ok: true, ignored: true });
    }

    const resourceKey = String(resourceIdRaw).trim();
    const kind = payload.server_id ? "vps" : payload.fqdn ? "domain" : null;
    const services = await db()
      .prepare("SELECT id,user_id FROM services WHERE tw_resource_id=? AND (? IS NULL OR kind=?) LIMIT 2")
      .all(resourceKey, kind, kind) as Array<{ id: string; user_id: string }>;
    const service = services.length === 1 ? services[0] : undefined;

    if (!service) {
      return Response.json({ ok: true, matched: false });
    }

    if (timewebToken()) {
      await syncServiceFromProvider(service.id);
    }

    await logAudit(service.user_id, "timeweb.webhook_synced", "service", service.id, {
      event: typeof payload.event === "string" ? payload.event : null,
      twResourceId: resourceKey,
    });

    return Response.json({ ok: true, matched: true, serviceId: service.id });
  } catch (error) {
    return apiError(error);
  }
}

