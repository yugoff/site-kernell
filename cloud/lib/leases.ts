import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "./d1";

export async function acquireLease(name: string, durationMs: number) {
  const holder = randomUUID();
  const now = Date.now();
  const result = await db().prepare(
    `INSERT INTO worker_leases (name,holder,expires_at) VALUES (?,?,?)
     ON CONFLICT(name) DO UPDATE SET holder=excluded.holder,expires_at=excluded.expires_at
     WHERE worker_leases.expires_at<=?`,
  ).run(name, holder, now + durationMs, now);
  if (!result.changes) return null;
  return async () => {
    await db().prepare("DELETE FROM worker_leases WHERE name=? AND holder=?").run(name, holder);
  };
}
