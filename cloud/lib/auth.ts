import "server-only";
import { cloudSetting } from "./settings";
import { cookies } from "next/headers";
import {
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { redirect } from "next/navigation";
import { batch, db } from "./database";
import type { User } from "./catalog";

const scrypt = promisify(scryptCallback);
const cookieName = "kernell_cloud_session";
const tokenHash = (token: string) =>
  createHash("sha256").update(token).digest("hex");

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const key = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt}:${key.toString("hex")}`;
}

export async function passwordMatches(password: string, stored: string) {
  const [salt, encoded] = stored.split(":");
  if (!salt || !encoded) return false;
  const expected = Buffer.from(encoded, "hex");
  const actual = (await scrypt(password, salt, 64)) as Buffer;
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function publicUser(row: {
  id: string;
  name: string;
  email: string;
  demo: number;
  email_verified_at?: number | null;
}): User {
  const demo = Boolean(row.demo);
  return {
    id: row.id,
    name: row.name,
    email: demo ? "demo@example.invalid" : row.email,
    demo,
    emailVerified: demo || Boolean(row.email_verified_at),
  };
}

export async function currentUser(): Promise<User | null> {
  const token = (await cookies()).get(cookieName)?.value;
  if (!token || token.length > 100) return null;
  const row = await db()
    .prepare(
      "SELECT u.id,u.name,u.email,u.demo,u.email_verified_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires>?",
    )
    .get(tokenHash(token), Date.now()) as
    | {
        id: string;
        name: string;
        email: string;
        demo: number;
        email_verified_at: number | null;
      }
    | undefined;
  return row ? publicUser(row) : null;
}

export async function requireUser() {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

export async function startSession(user: User) {
  const token = randomBytes(32).toString("hex");
  const lifetime = user.demo ? 86400 : 604800;
  const jar = await cookies();
  const previous = jar.get(cookieName)?.value;
  const now = Date.now();
  await batch(
    db().prepare("DELETE FROM sessions WHERE token=? OR expires<?")
      .bind(previous ? tokenHash(previous) : null, now),
    db().prepare("INSERT INTO sessions (token,user_id,expires) VALUES (?,?,?)")
      .bind(tokenHash(token), user.id, now + lifetime * 1000),
  );
  jar.set(cookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure:
      cloudSetting("CLOUD_ORIGIN")?.startsWith("https://") ??
      process.env.NODE_ENV === "production",
    path: "/",
    maxAge: lifetime,
  });
}

export async function endSession() {
  const jar = await cookies();
  const token = jar.get(cookieName)?.value;
  if (token)
    await db().prepare("DELETE FROM sessions WHERE token=?").run(tokenHash(token));
  jar.delete(cookieName);
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function checkOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const expected = cloudSetting("CLOUD_ORIGIN") || new URL(request.url).origin;
  if (origin === expected) return;
  // Next dev may put localhost in request.url even when the browser uses 127.0.0.1.
  if (process.env.NODE_ENV === "development" && origin) {
    const local = URL.parse(origin);
    if (local?.protocol === "http:" &&
        (local.hostname === "localhost" || local.hostname === "127.0.0.1") &&
        local.host === request.headers.get("host") && local.origin === origin) return;
  }
  throw new ApiError(403, "Обновите страницу и повторите действие.");
}

export async function jsonBody(
  request: Request,
): Promise<Record<string, unknown>> {
  if (!request.headers.get("content-type")?.includes("application/json"))
    throw new ApiError(415, "Ожидается JSON.");
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, "Пустой запрос.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 16384) {
      await reader.cancel();
      throw new ApiError(413, "Слишком большой запрос.");
    }
    chunks.push(value);
  }
  try {
    const data: unknown = JSON.parse(Buffer.concat(chunks).toString());
    if (!data || typeof data !== "object" || Array.isArray(data))
      throw new Error();
    return data as Record<string, unknown>;
  } catch {
    throw new ApiError(400, "Некорректный запрос.");
  }
}

// Persisted across restarts. Global and account-scoped buckets don't trust proxy IP headers.
export async function rateLimit(key: string, maximum: number, windowMs = 900000) {
  const sql = db();
  const now = Date.now();
  const row = await sql
    .prepare(
      `INSERT INTO rate_limits (key,count,resets) VALUES (?,1,?)
       ON CONFLICT(key) DO UPDATE SET
         count=CASE WHEN rate_limits.resets<=? THEN 1 ELSE rate_limits.count+1 END,
         resets=CASE WHEN rate_limits.resets<=? THEN excluded.resets ELSE rate_limits.resets END
       RETURNING count`,
    )
    .get(key, now + windowMs, now, now) as { count: number };
  if (row.count > maximum)
    throw new ApiError(
      429,
      "Слишком много попыток. Попробуйте через 15 минут.",
    );
}

export async function apiUser() {
  const user = await currentUser();
  if (!user) throw new ApiError(401, "Войдите в личный кабинет.");
  return user;
}

export function apiError(error: unknown) {
  if (error instanceof ApiError)
    return Response.json({ error: error.message }, { status: error.status });
  console.error(
    "Cloud API operation failed",
    error instanceof Error ? error.name : "UnknownError",
  );
  return Response.json(
    { error: "Не удалось выполнить действие. Попробуйте ещё раз." },
    { status: 500 },
  );
}
