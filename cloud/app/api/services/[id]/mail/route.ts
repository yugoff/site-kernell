import {
  ApiError,
  apiError,
  apiUser,
  checkOrigin,
  jsonBody,
  rateLimit,
} from "@cloud/lib/auth";
import { db, logActivity, logAudit } from "@cloud/lib/database";
import {
  TimewebApiError,
  createDomainMailbox,
  deleteDomainMailbox,
  listDomainMailboxes,
  timewebToken,
  updateDomainMailbox,
} from "@cloud/lib/timeweb";

export const runtime = "nodejs";

function ownedDomainFqdn(userId: string, serviceId: string) {
  const row = db()
    .prepare(
      "SELECT id,name,kind,tw_resource_id FROM services WHERE id=? AND user_id=?",
    )
    .get(serviceId, userId) as
    | { id: string; name: string; kind: string; tw_resource_id: string | null }
    | undefined;
  if (!row || row.kind !== "domain") {
    throw new ApiError(404, "Домен не найден.");
  }
  if (!row.tw_resource_id || !timewebToken()) {
    throw new ApiError(503, "Управление корпоративной почтой пока недоступно.");
  }
  return { id: row.id, name: row.name, fqdn: row.tw_resource_id };
}

function validMailboxName(raw: unknown): string {
  const local = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (!/^[a-z0-9][a-z0-9._-]{0,62}$/.test(local)) {
    throw new ApiError(
      400,
      "Имя почтового ящика: строчные латинские буквы, цифры, точки, дефисы (до 63 символов).",
    );
  }
  return local;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await apiUser();
    if (user.demo) {
      throw new ApiError(400, "Почта недоступна в деморежиме.");
    }
    const { id } = await context.params;
    rateLimit(`mail-read:${user.id}`, 60);
    const { fqdn } = ownedDomainFqdn(user.id, id);
    const rawMailboxes = await listDomainMailboxes(fqdn);
    // Strip upstream password field from list responses.
    const mailboxes = rawMailboxes.map((item) => ({
      fqdn: item.fqdn,
      mailbox: item.mailbox,
      comment: item.comment ?? "",
      usage_space: item.usage_space ?? 0,
      owner_full_name: item.owner_full_name ?? "",
    }));
    return Response.json(
      { fqdn, mailboxes },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    checkOrigin(request);
    const user = await apiUser();
    if (user.demo) {
      throw new ApiError(400, "Почта недоступна в деморежиме.");
    }
    const { id } = await context.params;
    rateLimit(`mail-write:${user.id}`, 30);
    const { fqdn, name } = ownedDomainFqdn(user.id, id);
    const body = await jsonBody(request);
    const mailbox = validMailboxName(body.mailbox);
    const password = typeof body.password === "string" ? body.password : "";
    if (password.length < 8 || password.length > 128) {
      throw new ApiError(400, "Пароль почтового ящика должен быть от 8 символов.");
    }
    const ownerFullName =
      typeof body.ownerFullName === "string"
        ? body.ownerFullName.trim().slice(0, 120)
        : undefined;
    const comment =
      typeof body.comment === "string"
        ? body.comment.trim().slice(0, 180)
        : undefined;

    const created = await createDomainMailbox(fqdn, {
      mailbox,
      password,
      ...(ownerFullName ? { owner_full_name: ownerFullName } : {}),
      ...(comment ? { comment } : {}),
    });

    logActivity(user.id, `Создан почтовый ящик ${mailbox}@${name}`);
    logAudit(user.id, "mail.mailbox_created", "service", id, { fqdn, mailbox });

    return Response.json({
      ok: true,
      mailbox: {
        fqdn: created.fqdn || fqdn,
        mailbox: created.mailbox || mailbox,
        comment: created.comment ?? "",
        owner_full_name: created.owner_full_name ?? "",
      },
    });
  } catch (error) {
    if (error instanceof TimewebApiError) {
      return apiError(
        new ApiError(
          error.statusCode >= 400 && error.statusCode < 500
            ? error.statusCode
            : 502,
          error.message || "Не удалось создать почтовый ящик.",
        ),
      );
    }
    return apiError(error);
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    checkOrigin(request);
    const user = await apiUser();
    if (user.demo) {
      throw new ApiError(400, "Почта недоступна в деморежиме.");
    }
    const { id } = await context.params;
    rateLimit(`mail-write:${user.id}`, 30);
    const { fqdn } = ownedDomainFqdn(user.id, id);
    const body = await jsonBody(request);
    const mailbox = validMailboxName(body.mailbox);
    const password =
      typeof body.password === "string" && body.password
        ? body.password
        : undefined;
    if (password && (password.length < 8 || password.length > 128)) {
      throw new ApiError(400, "Пароль почтового ящика должен быть от 8 символов.");
    }
    const comment =
      typeof body.comment === "string" ? body.comment.trim() : undefined;
    const ownerFullName =
      typeof body.ownerFullName === "string"
        ? body.ownerFullName.trim()
        : undefined;

    await updateDomainMailbox(fqdn, mailbox, {
      ...(password ? { password } : {}),
      ...(comment !== undefined ? { comment } : {}),
      ...(ownerFullName !== undefined ? { owner_full_name: ownerFullName } : {}),
    });
    logAudit(user.id, "mail.mailbox_updated", "service", id, { fqdn, mailbox });
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof TimewebApiError) {
      return apiError(
        new ApiError(
          error.statusCode >= 400 && error.statusCode < 500
            ? error.statusCode
            : 502,
          error.message || "Не удалось обновить почтовый ящик.",
        ),
      );
    }
    return apiError(error);
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    checkOrigin(request);
    const user = await apiUser();
    if (user.demo) {
      throw new ApiError(400, "Почта недоступна в деморежиме.");
    }
    const { id } = await context.params;
    rateLimit(`mail-write:${user.id}`, 30);
    const { fqdn, name } = ownedDomainFqdn(user.id, id);
    const { searchParams } = new URL(request.url);
    const mailbox = validMailboxName(searchParams.get("mailbox"));
    await deleteDomainMailbox(fqdn, mailbox);
    logActivity(user.id, `Удалён почтовый ящик ${mailbox}@${name}`);
    logAudit(user.id, "mail.mailbox_deleted", "service", id, { fqdn, mailbox });
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof TimewebApiError) {
      return apiError(
        new ApiError(
          error.statusCode >= 400 && error.statusCode < 500
            ? error.statusCode
            : 502,
          error.message || "Не удалось удалить почтовый ящик.",
        ),
      );
    }
    return apiError(error);
  }
}

