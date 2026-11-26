import { timingSafeEqual } from "node:crypto";
import { ApiError, apiError } from "@cloud/lib/auth";
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
  const configured = process.env.CLOUD_INTERNAL_SECRET?.trim();
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
    const tick = runBillingTick();
    const provisioning = await processProvisioningQueue();
    const synced = await syncPendingServices();
    const reconciled = await reconcileSubscriptionsWithProvider();
    const health = await checkProviderHealth().catch(() => ({
      configured: false as const,
      error: true,
    }));
    return Response.json(
      { ok: true, tick, provisioning, synced, reconciled, health },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}

