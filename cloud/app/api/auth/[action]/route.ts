import { cloudSetting } from "@cloud/lib/settings";
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
  logAudit,
  batch,
  activityStatement,
  auditStatement,
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
      if (cloudSetting("CLOUD_DEMO_ENABLED") === "false")
        throw new ApiError(404, "Демокабинет отключён.");
      await rateLimit("demo", 100);
      const existing = await currentUser();
      if (existing) return Response.json({ ok: true });
      const user = await createDemo();
      await startSession(user);
      return Response.json({ ok: true });
    }

    if (action === "verify-email") {
      const body = await jsonBody(request);
      if (typeof body.token === "string" && body.token.trim()) {
        await rateLimit("verify-confirm", 40);
        const verified = await consumeEmailToken(body.token.trim(), "verify_email", (userId) => [
          db().prepare("UPDATE users SET email_verified_at=? WHERE id=? AND demo=0 AND changes()=1")
            .bind(Date.now(), userId),
          activityStatement(userId, "Email подтверждён", true),
          auditStatement(userId, "auth.email_verified", "user", userId, undefined, true),
        ]);
        if (!verified)
          throw new ApiError(
            400,
            "Ссылка подтверждения недействительна или устарела.",
          );
        return Response.json({ ok: true, message: "Email успешно подтверждён." });
      }

      const user = await apiUser();
      if (user.demo)
        throw new ApiError(400, "В демокабинете подтверждение email недоступно.");
      if (user.emailVerified)
        return Response.json({ ok: true, message: "Email уже подтверждён." });
      await rateLimit(`verify:${user.id}`, 5);
      const token = await issueEmailToken(user.id, "verify_email", VERIFY_TTL_MS);
      const sent = await sendVerificationEmail(user.email, user.name, token).catch(
        () => false,
      );
      await logAudit(user.id, "auth.verify_email_requested", "user", user.id, { sent });
      return Response.json({
        ok: true,
        delivered: sent,
        message: sent
          ? "Письмо со ссылкой подтверждения отправлено."
          : "Почтовый шлюз пока не настроен. Заявка на подтверждение создана.",
      });
    }

    if (action === "forgot-password") {
      await rateLimit("forgot-global", 60);
      const body = await jsonBody(request);
      const email =
        typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)
        throw new ApiError(400, "Введите корректный email.");
      await rateLimit(`forgot:${email}`, 5);
      const row = await db()
        .prepare("SELECT id,name,email FROM users WHERE email=? AND demo=0")
        .get(email) as { id: string; name: string; email: string } | undefined;
      if (row) {
        const token = await issueEmailToken(row.id, "reset_password", RESET_TTL_MS);
        const sent = await sendPasswordResetEmail(row.email, row.name, token).catch(
          () => false,
        );
        await logAudit(row.id, "auth.password_reset_requested", "user", row.id, {
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
      await rateLimit("reset-password", 30);
      const body = await jsonBody(request);
      const token = typeof body.token === "string" ? body.token.trim() : "";
      const password = typeof body.password === "string" ? body.password : "";
      if (!token) throw new ApiError(400, "Не указан токен сброса пароля.");
      if (password.length < 10 || password.length > 128)
        throw new ApiError(400, "Используйте пароль длиной от 10 символов.");
      const reset = await consumeEmailToken(token, "reset_password", async (userId) => {
        const encoded = await hashPassword(password);
        return [
          db().prepare("UPDATE users SET password=? WHERE id=? AND demo=0 AND changes()=1")
            .bind(encoded, userId),
          activityStatement(userId, "Пароль восстановлен, активные сессии завершены", true),
          auditStatement(userId, "auth.password_reset", "user", userId, undefined, true),
          db().prepare("DELETE FROM sessions WHERE user_id=? AND changes()=1").bind(userId),
        ];
      });
      if (!reset)
        throw new ApiError(
          400,
          "Ссылка для сброса пароля недействительна или устарела.",
        );
      return Response.json({
        ok: true,
        message: "Пароль обновлён. Войдите с новым паролем.",
      });
    }

    if (action !== "login" && action !== "register")
      throw new ApiError(404, "Страница не найдена.");
    await rateLimit("auth-global", 150);
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
    await rateLimit(`auth:${email}`, 12);
    if (action === "register") {
      const name = typeof body.name === "string" ? body.name.trim() : "";
      if (name.length < 2 || name.length > 70)
        throw new ApiError(400, "Введите имя от 2 до 70 символов.");
      if (password.length < 10)
        throw new ApiError(400, "Используйте пароль длиной от 10 символов.");
      if (body.consent !== true)
        throw new ApiError(400, "Подтвердите согласие на обработку данных.");
      const encoded = await hashPassword(password);
      const id = randomUUID();
      const [created] = await batch(
        db()
          .prepare(
            "INSERT INTO users (id,name,email,password,created) VALUES (?,?,?,?,?) ON CONFLICT(email) DO NOTHING",
          )
          .bind(id, name, email, encoded, Date.now()),
        activityStatement(id, "Личный кабинет создан", true),
        auditStatement(id, "auth.register", "user", id, undefined, true),
      );
      if (!created.meta.changes) {
        throw new ApiError(409, "Аккаунт с таким email уже существует. Войдите в него.");
      }
      const user = { id, name, email, demo: false, emailVerified: false };
      const verifyToken = await issueEmailToken(user.id, "verify_email", VERIFY_TTL_MS);
      await sendVerificationEmail(user.email, user.name, verifyToken).catch(
        () => false,
      );
      await startSession(user);
    } else {
      const row = await db()
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
      await logAudit(row.id, "auth.login", "user", row.id);
      await startSession(publicUser(row));
    }
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
