import {
  ApiError,
  apiError,
  apiUser,
  checkOrigin,
  rateLimit,
} from "@cloud/lib/auth";
import { db, logAudit, readServiceCredentials } from "@cloud/lib/database";
import { syncServiceFromProvider } from "@cloud/lib/provisioning";
import { timewebToken } from "@cloud/lib/timeweb";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    checkOrigin(request);
    const user = await apiUser();
    const { id } = await context.params;
    await rateLimit(`service-creds:${user.id}`, 30);

    if (user.demo) {
      throw new ApiError(400, "В демокабинете реальные пароли не хранятся.");
    }

    const service = await db()
      .prepare(
        "SELECT id,kind,tw_resource_id FROM services WHERE id=? AND user_id=?",
      )
      .get(id, user.id) as
      | { id: string; kind: string; tw_resource_id: string | null }
      | undefined;

    if (
      !service ||
      !["vps", "database", "s3", "k8s"].includes(service.kind)
    ) {
      throw new ApiError(404, "Услуга не найдена или не содержит учётных данных.");
    }

    let creds = await readServiceCredentials(id, user.id);
    const missingForKind =
      (service.kind === "vps" && !creds?.rootPass) ||
      (service.kind === "s3" && (!creds?.s3AccessKey || !creds?.s3SecretKey)) ||
      (service.kind === "k8s" && !creds?.kubeconfig);

    if (missingForKind && service.tw_resource_id && timewebToken()) {
      await syncServiceFromProvider(id, user.id).catch(() => null);
      creds = await readServiceCredentials(id, user.id);
    }

    await logAudit(user.id, `${service.kind}.credentials_viewed`, "service", id);

    return Response.json(
      {
        rootPass: creds?.rootPass ?? null,
        vncPass: creds?.vncPass ?? null,
        dbLogin: creds?.dbLogin ?? null,
        dbPassword: creds?.dbPassword ?? null,
        dbHost: creds?.dbHost ?? null,
        dbPort: creds?.dbPort ?? null,
        s3AccessKey: creds?.s3AccessKey ?? null,
        s3SecretKey: creds?.s3SecretKey ?? null,
        s3Hostname: creds?.s3Hostname ?? null,
        kubeconfig: creds?.kubeconfig ?? null,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}

