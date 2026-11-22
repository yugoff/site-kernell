import {
  ApiError,
  apiError,
  apiUser,
  checkOrigin,
  endSession,
  hashPassword,
  jsonBody,
  passwordMatches,
  rateLimit,
  startSession,
} from "@cloud/lib/auth";
import { db, logActivity, transaction } from "@cloud/lib/database";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const user = await apiUser();
    const body = await jsonBody(request);
    rateLimit(`profile:${user.id}`, 12);
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (name.length < 2 || name.length > 70)
      throw new ApiError(400, "Введите имя от 2 до 70 символов.");
    let password: string | null = null;
    if (body.newPassword) {
      if (user.demo)
        throw new ApiError(
          400,
          "Создайте свой аккаунт, чтобы настроить пароль.",
        );
      if (
        typeof body.newPassword !== "string" ||
        body.newPassword.length < 10 ||
        body.newPassword.length > 128 ||
        typeof body.currentPassword !== "string" ||
        body.currentPassword.length > 128
      )
        throw new ApiError(
          400,
          "Новый пароль должен содержать от 10 до 128 символов.",
        );
      const stored = db()
        .prepare("SELECT password FROM users WHERE id=?")
        .get(user.id) as { password: string };
      if (!(await passwordMatches(body.currentPassword, stored.password)))
        throw new ApiError(400, "Текущий пароль указан неверно.");
      password = await hashPassword(body.newPassword);
    }
    transaction(() => {
      db().prepare("UPDATE users SET name=? WHERE id=?").run(name, user.id);
      if (password) {
        db()
          .prepare("UPDATE users SET password=? WHERE id=?")
          .run(password, user.id);
        db().prepare("DELETE FROM sessions WHERE user_id=?").run(user.id);
      }
      logActivity(
        user.id,
        password
          ? "Пароль изменён, остальные сессии завершены"
          : "Профиль обновлён",
      );
    });
    if (password) {
      await endSession();
      await startSession({ ...user, name });
    }
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
