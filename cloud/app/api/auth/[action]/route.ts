import { randomUUID } from "node:crypto";
import {
  ApiError,
  apiError,
  checkOrigin,
  currentUser,
  endSession,
  hashPassword,
  jsonBody,
  passwordMatches,
  publicUser,
  rateLimit,
  startSession,
} from "@cloud/lib/auth";
import { createDemo, db, logActivity, transaction } from "@cloud/lib/database";

export const runtime = "nodejs";
export async function POST(
  request: Request,
  context: { params: Promise<{ action: string }> },
) {
  try {
    checkOrigin(request);
    const { action } = await context.params;
    if (action === "logout") {
      await endSession();
      return Response.json({ ok: true });
    }
    if (action === "demo") {
      if (process.env.CLOUD_DEMO_ENABLED === "false")
        throw new ApiError(404, "Демокабинет отключён.");
      rateLimit("demo", 100);
      const existing = await currentUser();
      if (existing) return Response.json({ ok: true });
      const user = createDemo();
      await startSession(user);
      return Response.json({ ok: true });
    }
    if (action !== "login" && action !== "register")
      throw new ApiError(404, "Страница не найдена.");
    rateLimit("auth-global", 150);
    const body = await jsonBody(request);
    const email =
      typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      email.length > 254 ||
      password.length > 128
    )
      throw new ApiError(400, "Проверьте email и пароль.");
    rateLimit(`auth:${email}`, 12);
    if (action === "register") {
      const name = typeof body.name === "string" ? body.name.trim() : "";
      if (name.length < 2 || name.length > 70)
        throw new ApiError(400, "Введите имя от 2 до 70 символов.");
      if (password.length < 10)
        throw new ApiError(400, "Используйте пароль длиной от 10 символов.");
      if (body.consent !== true)
        throw new ApiError(400, "Подтвердите согласие на обработку данных.");
      const encoded = await hashPassword(password);
      const user = transaction(() => {
        if (db().prepare("SELECT id FROM users WHERE email=?").get(email))
          throw new ApiError(
            409,
            "Аккаунт с таким email уже существует. Войдите в него.",
          );
        const id = randomUUID();
        db()
          .prepare(
            "INSERT INTO users (id,name,email,password,created) VALUES (?,?,?,?,?)",
          )
          .run(id, name, email, encoded, Date.now());
        logActivity(id, "Личный кабинет создан");
        return { id, name, email, demo: false };
      });
      await startSession(user);
    } else {
      const row = db()
        .prepare(
          "SELECT id,name,email,demo,password FROM users WHERE email=? AND demo=0",
        )
        .get(email) as
        | {
            id: string;
            name: string;
            email: string;
            demo: number;
            password: string;
          }
        | undefined;
      // Do the same expensive operation for unknown accounts to reduce timing differences.
      const valid = row
        ? await passwordMatches(password, row.password)
        : (await hashPassword(password), false);
      if (!row || !valid) throw new ApiError(401, "Неверный email или пароль.");
      await startSession(publicUser(row));
    }
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
