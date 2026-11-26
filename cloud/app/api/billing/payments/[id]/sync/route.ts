import {
  apiError,
  apiUser,
  checkOrigin,
  rateLimit,
} from "@cloud/lib/auth";
import { syncUserPaymentById } from "@cloud/lib/billing";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    checkOrigin(request);
    const user = await apiUser();
    rateLimit(`pay-sync:${user.id}`, 30);
    const { id } = await context.params;
    const result = await syncUserPaymentById(user.id, id);
    return Response.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}

