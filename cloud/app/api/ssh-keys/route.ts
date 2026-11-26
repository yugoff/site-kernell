import { createHash, randomUUID } from "node:crypto";
import {
  ApiError,
  apiError,
  apiUser,
  checkOrigin,
  jsonBody,
  rateLimit,
} from "@cloud/lib/auth";
import {
  db,
  listSshKeysForUser,
  logActivity,
  logAudit,
  transaction,
} from "@cloud/lib/database";
import {
  TimewebApiError,
  createTimewebSshKey,
  deleteTimewebSshKey,
  timewebToken,
} from "@cloud/lib/timeweb";

export const runtime = "nodejs";

const ALLOWED_KEY_PREFIXES = new Set([
  "ssh-ed25519",
  "ssh-rsa",
  "ecdsa-sha2-nistp256",
  "ecdsa-sha2-nistp384",
  "ecdsa-sha2-nistp521",
  "sk-ssh-ed25519@openssh.com",
  "sk-ecdsa-sha2-nistp256@openssh.com",
]);

function parsePublicKey(raw: unknown): { normalized: string; fingerprint: string } {
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  if (!trimmed || trimmed.length > 8192 || /[\r\n]/.test(trimmed)) {
    throw new ApiError(400, "Укажите одну строку публичного SSH-ключа.");
  }
  const parts = trimmed.split(/\s+/);
  if (parts.length < 2 || !ALLOWED_KEY_PREFIXES.has(parts[0])) {
    throw new ApiError(
      400,
      "Поддерживаются публичные SSH-ключи Ed25519, RSA и ECDSA.",
    );
  }
  const keyBlob = Buffer.from(parts[1], "base64");
  if (keyBlob.length < 16 || keyBlob.toString("base64") !== parts[1]) {
    throw new ApiError(400, "Некорректный формат публичного SSH-ключа.");
  }
  const fingerprint =
    "SHA256:" + createHash("sha256").update(keyBlob).digest("base64").replace(/=+$/, "");
  const normalized = parts.slice(0, 3).join(" ");
  return { normalized, fingerprint };
}

export async function GET() {
  try {
    const user = await apiUser();
    return Response.json(
      { sshKeys: user.demo ? [] : listSshKeysForUser(user.id) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const user = await apiUser();
    if (user.demo) {
      throw new ApiError(
        400,
        "В демокабинете нельзя сохранять SSH-ключи.",
      );
    }
    rateLimit(`ssh-keys:${user.id}`, 20);
    const body = await jsonBody(request);
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (name.length < 2 || name.length > 80) {
      throw new ApiError(400, "Укажите название SSH-ключа (2–80 символов).");
    }
    const { normalized, fingerprint } = parsePublicKey(body.publicKey);

    const existing = db()
      .prepare("SELECT id FROM ssh_keys WHERE user_id=? AND fingerprint=?")
      .get(user.id, fingerprint) as { id: string } | undefined;
    if (existing) {
      throw new ApiError(409, "Такой SSH-ключ уже сохранён в аккаунте.");
    }

    let twSshKeyId: number | null = null;
    if (timewebToken()) {
      try {
        const created = await createTimewebSshKey(
          `kc-${user.id.slice(0, 8)}-${name.slice(0, 36)}`,
          normalized,
          false,
        );
        twSshKeyId = created.id;
      } catch (error) {
        if (error instanceof TimewebApiError) {
          throw new ApiError(
            502,
            "Не удалось зарегистрировать SSH-ключ в Timeweb Cloud.",
          );
        }
        throw error;
      }
    }

    const id = randomUUID();
    const now = Date.now();
    transaction(() => {
      db()
        .prepare(
          "INSERT INTO ssh_keys (id,user_id,name,fingerprint,public_key,tw_ssh_key_id,created_at) VALUES (?,?,?,?,?,?,?)",
        )
        .run(id, user.id, name, fingerprint, normalized, twSshKeyId, now);
      logActivity(user.id, `Добавлен SSH-ключ: ${name}`);
      logAudit(user.id, "ssh_key.create", "ssh_key", id, {
        fingerprint,
        twSshKeyId,
      });
    });

    return Response.json({
      sshKey: {
        id,
        name,
        fingerprint,
        twSshKeyId,
        createdAt: now,
      },
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    checkOrigin(request);
    const user = await apiUser();
    if (user.demo) {
      throw new ApiError(400, "В демокабинете SSH-ключи недоступны.");
    }
    rateLimit(`ssh-keys:${user.id}`, 30);
    const url = new URL(request.url);
    const id = url.searchParams.get("id")?.trim() || "";
    if (!id) throw new ApiError(400, "Не указан идентификатор SSH-ключа.");

    const existing = db()
      .prepare(
        "SELECT id,name,tw_ssh_key_id FROM ssh_keys WHERE id=? AND user_id=?",
      )
      .get(id, user.id) as
      | { id: string; name: string; tw_ssh_key_id: number | null }
      | undefined;
    if (!existing) throw new ApiError(404, "SSH-ключ не найден.");

    if (existing.tw_ssh_key_id && timewebToken()) {
      try {
        await deleteTimewebSshKey(existing.tw_ssh_key_id);
      } catch (error) {
        if (!(error instanceof TimewebApiError && error.statusCode === 404)) {
          throw new ApiError(502, "Не удалось удалить SSH-ключ в Timeweb Cloud.");
        }
      }
    }

    transaction(() => {
      db()
        .prepare("DELETE FROM ssh_keys WHERE id=? AND user_id=?")
        .run(id, user.id);
      logActivity(user.id, `Удалён SSH-ключ: ${existing.name}`);
      logAudit(user.id, "ssh_key.delete", "ssh_key", id);
    });

    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}

