import { randomUUID } from "node:crypto";
import {
  ApiError,
  apiError,
  apiUser,
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
import {
  createDemo,
  db,
  logActivity,
  logAudit,
  transaction,
} from "@cloud/lib/database";
import { consumeEmailToken, issueEmailToken } from "@cloud/lib/email-tokens";
import { sendPasswordResetEmail, sendVerificationEmail } from "@cloud/lib/mailer";

export const runtime = "nodejs";

const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 30 * 60 * 1000;

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

    if (action === "verify-email") {
      const body = await jsonBody(request);
      if (typeof body.token === "string" && body.token.trim()) {
        rateLimit("verify-confirm", 40);
        const userId = consumeEmailToken(body.token.trim(), "verify_email");
        if (!userId)
          throw new ApiError(
            400,
            "Ссылка подтверждения недействительна или устарела.",
          );
        const now = Date.now();
        transaction(() => {
          db()
            .prepare("UPDATE users SET email_verified_at=? WHERE id=? AND demo=0")
            .run(now, userId);
          logActivity(userId, "Email подтверждён");
          logAudit(userId, "auth.email_verified", "user", userId);
        });
        return Response.json({ ok: true, message: "Email успешно подтверждён." });
      }

      const user = await apiUser();
      if (user.demo)
        throw new ApiError(400, "В демокабинете подтверждение email недоступно.");
      if (user.emailVerified)
        return Response.json({ ok: true, message: "Email уже подтверждён." });
      rateLimit(`verify:${user.id}`, 5);
      const token = issueEmailToken(user.id, "verify_email", VERIFY_TTL_MS);
      const sent = await sendVerificationEmail(user.email, user.name, token).catch(
        () => false,
      );
      logAudit(user.id, "auth.verify_email_requested", "user", user.id, { sent });
      return Response.json({
        ok: true,
        delivered: sent,
        message: sent
          ? "Письмо со ссылкой подтверждения отправлено."
          : "Почтовый шлюз пока не настроен. Заявка на подтверждение создана.",
      });
    }

    if (action === "forgot-password") {
      rateLimit("forgot-global", 60);
      const body = await jsonBody(request);
      const email =
        typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)
        throw new ApiError(400, "Введите корректный email.");
      rateLimit(`forgot:${email}`, 5);
      const row = db()
        .prepare("SELECT id,name,email FROM users WHERE email=? AND demo=0")
        .get(email) as { id: string; name: string; email: string } | undefined;
      if (row) {
        const token = issueEmailToken(row.id, "reset_password", RESET_TTL_MS);
        const sent = await sendPasswordResetEmail(row.email, row.name, token).catch(
          () => false,
        );
        logAudit(row.id, "auth.password_reset_requested", "user", row.id, {
          sent,
        });
      }
      return Response.json({
        ok: true,
        message:
          "Если аккаунт с таким email существует, мы отправили ссылку для сброса пароля.",
      });
    }

    if (action === "reset-password") {
      rateLimit("reset-password", 30);
      const body = await jsonBody(request);
      const token = typeof body.token === "string" ? body.token.trim() : "";
      const password = typeof body.password === "string" ? body.password : "";
      if (!token) throw new ApiError(400, "Не указан токен сброса пароля.");
      if (password.length < 10 || password.length > 128)
        throw new ApiError(400, "Используйте пароль длиной от 10 символов.");
      const userId = consumeEmailToken(token, "reset_password");
      if (!userId)
        throw new ApiError(
          400,
          "Ссылка для сброса пароля недействительна или устарела.",
        );
      const encoded = await hashPassword(password);
      transaction(() => {
        db()
          .prepare("UPDATE users SET password=? WHERE id=? AND demo=0")
          .run(encoded, userId);
        db().prepare("DELETE FROM sessions WHERE user_id=?").run(userId);
        logActivity(userId, "Пароль восстановлен, активные сессии завершены");
        logAudit(userId, "auth.password_reset", "user", userId);
      });
      return Response.json({
        ok: true,
        message: "Пароль обновлён. Войдите с новым паролем.",
      });
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
        logAudit(id, "auth.register", "user", id);
        return { id, name, email, demo: false, emailVerified: false };
      });
      const verifyToken = issueEmailToken(user.id, "verify_email", VERIFY_TTL_MS);
      void sendVerificationEmail(user.email, user.name, verifyToken).catch(
        () => false,
      );
      await startSession(user);
    } else {
      const row = db()
        .prepare(
          "SELECT id,name,email,demo,email_verified_at,password FROM users WHERE email=? AND demo=0",
        )
        .get(email) as
        | {
            id: string;
            name: string;
            email: string;
            demo: number;
            email_verified_at: number | null;
            password: string;
          }
        | undefined;
      // Do the same expensive operation for unknown accounts to reduce timing differences.
      const valid = row
        ? await passwordMatches(password, row.password)
        : (await hashPassword(password), false);
      if (!row || !valid) throw new ApiError(401, "Неверный email или пароль.");
      logAudit(row.id, "auth.login", "user", row.id);
      await startSession(publicUser(row));
    }
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
