import {
  ApiError,
  apiError,
  apiUser,
  checkOrigin,
  jsonBody,
  rateLimit,
} from "@cloud/lib/auth";
import { createWalletTopup } from "@cloud/lib/billing";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const user = await apiUser();
    await rateLimit(`topup:${user.id}`, 20);
    const body = await jsonBody(request);
    const amountRub = Number(body.amountRub);
    const requestKey =
      typeof body.requestKey === "string" ? body.requestKey.trim() : "";
    if (!Number.isInteger(amountRub)) {
      throw new ApiError(400, "Укажите целую сумму пополнения в рублях.");
    }
    const result = await createWalletTopup(user, amountRub, requestKey);
    return Response.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}

