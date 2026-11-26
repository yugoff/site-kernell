import "server-only";
import { randomToken, sha256Hex } from "./crypto";
import { db, transaction } from "./database";

export type EmailTokenKind = "verify_email" | "reset_password";

export function issueEmailToken(
  userId: string,
  kind: EmailTokenKind,
  ttlMs: number,
): string {
  const rawToken = randomToken(32);
  const hash = sha256Hex(rawToken);
  const now = Date.now();
  transaction(() => {
    const sql = db();
    sql
      .prepare(
        "UPDATE user_email_tokens SET used_at=? WHERE user_id=? AND kind=? AND used_at IS NULL",
      )
      .run(now, userId, kind);
    sql
      .prepare(
        "INSERT INTO user_email_tokens (token_hash,user_id,kind,expires_at,used_at,created_at) VALUES (?,?,?,?,NULL,?)",
      )
      .run(hash, userId, kind, now + ttlMs, now);
    sql
      .prepare("DELETE FROM user_email_tokens WHERE expires_at<?")
      .run(now - 86_400_000);
  });
  return rawToken;
}

export function consumeEmailToken(
  rawToken: string,
  kind: EmailTokenKind,
): string | null {
  if (!/^[0-9a-f]{64}$/i.test(rawToken)) return null;
  const hash = sha256Hex(rawToken);
  const now = Date.now();
  return transaction(() => {
    const sql = db();
    const row = sql
      .prepare(
        "SELECT user_id FROM user_email_tokens WHERE token_hash=? AND kind=? AND used_at IS NULL AND expires_at>?",
      )
      .get(hash, kind, now) as { user_id: string } | undefined;
    if (!row) return null;
    sql
      .prepare("UPDATE user_email_tokens SET used_at=? WHERE token_hash=?")
      .run(now, hash);
    return row.user_id;
  });
}

