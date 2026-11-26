import { randomUUID } from "node:crypto";
import { isIPv4 } from "node:net";
import {
  ApiError,
  apiError,
  apiUser,
  checkOrigin,
  jsonBody,
  rateLimit,
} from "@cloud/lib/auth";
import { db, logActivity, logAudit, transaction } from "@cloud/lib/database";
import {
  TimewebApiError,
  createFirewallGroup,
  createVpc,
  timewebToken,
} from "@cloud/lib/timeweb";

export const runtime = "nodejs";

const ALLOWED_VPC_LOCATIONS = new Set(["ru-1", "ru-2", "pl-1", "nl-1"]);

export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const user = await apiUser();
    if (user.demo) {
      throw new ApiError(400, "В демокабинете сетевые ресурсы недоступны.");
    }
    if (!user.emailVerified) {
      throw new ApiError(
        403,
        "Подтвердите email в разделе «Настройки» перед созданием ресурсов.",
      );
    }
    if (!timewebToken()) {
      throw new ApiError(503, "Управление облачной инфраструктурой пока недоступно.");
    }

    rateLimit(`infra-free:${user.id}`, 20);
    const body = await jsonBody(request);
    const kind = body.kind;
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{1,47}$/.test(name)) {
      throw new ApiError(
        400,
        "Название должно содержать 2–48 латинских букв, цифр, точек или дефисов.",
      );
    }

    const renewalIso = new Date(Date.now() + 365 * 86_400_000).toISOString();

    if (kind === "vpc") {
      const location =
        typeof body.location === "string" ? body.location.trim() : "ru-1";
      if (!ALLOWED_VPC_LOCATIONS.has(location)) {
        throw new ApiError(400, "Выберите поддерживаемую локацию для VPC.");
      }
      const subnetV4 =
        typeof body.subnetV4 === "string"
          ? body.subnetV4.trim()
          : "10.0.0.0/24";
      const [ipPart, maskPart] = subnetV4.split("/");
      const mask = Number(maskPart);
      const octets = (ipPart || "").split(".").map(Number);
      const isRfc1918 =
        isIPv4(ipPart || "") &&
        (octets[0] === 10 ||
          (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
          (octets[0] === 192 && octets[1] === 168));
      if (!isRfc1918 || !Number.isInteger(mask) || mask < 16 || mask > 30) {
        throw new ApiError(
          400,
          "Укажите приватную IPv4 подсеть RFC1918 (например, 10.0.0.0/24).",
        );
      }
      const vpc = await createVpc({ name, subnet_v4: subnetV4, location });
      const id = randomUUID();
      transaction(() => {
        db()
          .prepare(
            "INSERT INTO services (id,user_id,kind,name,status,price,renewal,details,address,auto_renew,tw_resource_id,tw_project_id,cost_price,metadata_json) VALUES (?,?,'vpc',?,'active',0,?,?,?,0,?,NULL,0,?)",
          )
          .run(
            id,
            user.id,
            vpc.name || name,
            renewalIso,
            `Приватная сеть · ${subnetV4}|${location}|Изолированная подсеть`,
            subnetV4,
            vpc.id,
            JSON.stringify({ subnetV4, location }),
          );
        logActivity(user.id, `Создана приватная сеть VPC ${name} (${subnetV4})`);
        logAudit(user.id, "vpc.created", "service", id, { twResourceId: vpc.id });
      });
      return Response.json({ ok: true, id, kind: "vpc" });
    }

    if (kind === "firewall") {
      const description =
        typeof body.description === "string"
          ? body.description.trim().slice(0, 200)
          : "";
      const group = await createFirewallGroup(name, description || undefined);
      const id = randomUUID();
      transaction(() => {
        db()
          .prepare(
            "INSERT INTO services (id,user_id,kind,name,status,price,renewal,details,address,auto_renew,tw_resource_id,tw_project_id,cost_price,metadata_json) VALUES (?,?,'firewall',?,'active',0,?,?,?,0,?,NULL,0,?)",
          )
          .run(
            id,
            user.id,
            group.name || name,
            renewalIso,
            `Группа правил Firewall|Все локации|Ingress / Egress`,
            "",
            group.id,
            JSON.stringify({ description }),
          );
        logActivity(user.id, `Создана группа Firewall ${name}`);
        logAudit(user.id, "firewall.created", "service", id, {
          twResourceId: group.id,
        });
      });
      return Response.json({ ok: true, id, kind: "firewall" });
    }

    throw new ApiError(400, "Поддерживается создание VPC и групп Firewall.");
  } catch (error) {
    if (error instanceof TimewebApiError) {
      return apiError(
        new ApiError(
          error.statusCode >= 400 && error.statusCode < 500
            ? error.statusCode
            : 502,
          error.message || "Не удалось создать сетевой ресурс.",
        ),
      );
    }
    return apiError(error);
  }
}
