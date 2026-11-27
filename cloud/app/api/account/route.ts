import { apiError, apiUser } from "@cloud/lib/auth";
import { accountFor } from "@cloud/lib/database";
export const runtime = "nodejs";
export async function GET() {
  try {
    return Response.json(await accountFor(await apiUser()), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}
