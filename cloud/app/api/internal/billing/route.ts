import { cloudSetting } from "@cloud/lib/settings";
import { timingSafeEqual } from "node:crypto";
import { ApiError, apiError } from "@cloud/lib/auth";
import { batch, db } from "@cloud/lib/d1";
import { acquireLease } from "@cloud/lib/leases";
import { salesEnabled } from "@cloud/lib/sales";
import {
  checkProviderHealth,
  reconcileSubscriptionsWithProvider,
  runBillingTick,
} from "@cloud/lib/billing-worker";
import {
  processProvisioningQueue,
  syncPendingServices,
} from "@cloud/lib/provisioning";

export const runtime = "nodejs";

function assertInternalSecret(request: Request) {
  const configured = cloudSetting("CLOUD_INTERNAL_SECRET")?.trim();
  if (!configured) {
    throw new ApiError(503, "Внутренний секрет не настроен.");
  }
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const expectedBuf = Buffer.from(configured, "utf8");
  const actualBuf = Buffer.from(token, "utf8");
  if (
    expectedBuf.length !== actualBuf.length ||
    !timingSafeEqual(expectedBuf, actualBuf)
  ) {
    throw new ApiError(401, "Недостаточно прав.");
  }
}

export async function GET(request: Request) {
  try {
    assertInternalSecret(request);
    const health = await checkProviderHealth();
    return Response.json(health, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertInternalSecret(request);
    const headers = { "Cache-Control": "private, no-store" };
    const release = await acquireLease("maintenance", 5 * 60_000);
    if (!release) return Response.json({ ok: true, busy: true }, { headers });
    try {
      const now = Date.now();
      await batch(
        db().prepare("DELETE FROM rate_limits WHERE resets<=?").bind(now),
        db().prepare("DELETE FROM sessions WHERE expires<=?").bind(now),
        db().prepare("DELETE FROM worker_leases WHERE expires_at<=? AND name!='maintenance'").bind(now),
      );
      if (!salesEnabled()) return Response.json({ ok: true, salesEnabled: false }, { headers });
      const tick = await runBillingTick(now);
      const provisioning = await processProvisioningQueue(2);
      const synced = await syncPendingServices(4);
      const reconciled = await reconcileSubscriptionsWithProvider(3);
      const health = await checkProviderHealth().catch(() => ({
        configured: false as const,
        error: true,
      }));
      return Response.json({ ok: true, tick, provisioning, synced, reconciled, health }, { headers });
    } finally {
      await release();
    }
  } catch (error) {
    return apiError(error);
  }
}

