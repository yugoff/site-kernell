import "server-only";
import type { D1PreparedStatement } from "@cloudflare/workers-types";
import { randomToken, sha256Hex } from "./crypto";
import { batch, db } from "./database";

export type EmailTokenKind = "verify_email" | "reset_password";

export async function issueEmailToken(
  userId: string,
  kind: EmailTokenKind,
  ttlMs: number,
): Promise<string> {
  const rawToken = randomToken(32);
  const hash = sha256Hex(rawToken);
  const now = Date.now();
  await batch(
    db()
      .prepare(
        "UPDATE user_email_tokens SET used_at=? WHERE user_id=? AND kind=? AND used_at IS NULL",
      )
      .bind(now, userId, kind),
    db()
      .prepare(
        "INSERT INTO user_email_tokens (token_hash,user_id,kind,expires_at,used_at,created_at) VALUES (?,?,?,?,NULL,?)",
      )
      .bind(hash, userId, kind, now + ttlMs, now),
    db()
      .prepare("DELETE FROM user_email_tokens WHERE expires_at<?")
      .bind(now - 86_400_000),
  );
  return rawToken;
}

export async function consumeEmailToken(
  rawToken: string,
  kind: EmailTokenKind,
  statements: (userId: string) => D1PreparedStatement[] | Promise<D1PreparedStatement[]>,
): Promise<boolean> {
  if (!/^[0-9a-f]{64}$/i.test(rawToken)) return false;
  const hash = sha256Hex(rawToken);
  const row = await db()
    .prepare(
      "SELECT user_id FROM user_email_tokens WHERE token_hash=? AND kind=? AND used_at IS NULL AND expires_at>?",
    )
    .get(hash, kind, Date.now());
  if (typeof row?.user_id !== "string") return false;
  const apply = await statements(row.user_id);
  const now = Date.now();
  const [consumed] = await batch(
    db().prepare(
      "UPDATE user_email_tokens SET used_at=? WHERE token_hash=? AND kind=? AND used_at IS NULL AND expires_at>?",
    ).bind(now, hash, kind, now),
    ...apply,
  );
  return consumed.meta.changes === 1;
}

