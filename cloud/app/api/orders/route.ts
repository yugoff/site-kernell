import { randomUUID } from "node:crypto";
import { domainToASCII } from "node:url";
import {
  ApiError,
  apiError,
  apiUser,
  checkOrigin,
  jsonBody,
  rateLimit,
} from "@cloud/lib/auth";
import { db, logActivity, transaction } from "@cloud/lib/database";
import { locations, operatingSystems, plans, zones } from "@cloud/lib/catalog";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const user = await apiUser();
    const body = await jsonBody(request);
    rateLimit(`orders:${user.id}`, 30);
    const key = typeof body.requestKey === "string" ? body.requestKey : "";
    if (!/^[\w-]{10,80}$/.test(key))
      throw new ApiError(400, "Обновите форму заказа.");
    let title: string;
    let amount: number;
    if (body.kind === "vps") {
      const plan = plans.find((item) => item.id === body.plan);
      const name = typeof body.name === "string" ? body.name.trim() : "";
      if (
        !plan ||
        !/^[a-zA-Z0-9][a-zA-Z0-9-]{1,47}$/.test(name) ||
        !operatingSystems.includes(String(body.os)) ||
        !locations.includes(String(body.location))
      )
        throw new ApiError(
          400,
          "Проверьте параметры сервера. Имя: 2–48 латинских букв, цифр или дефисов.",
        );
      title = `VPS ${name} · ${plan.name} · ${body.os} · ${body.location}`;
      amount = plan.price;
    } else if (body.kind === "domain") {
      const name =
        typeof body.name === "string" ? body.name.trim().toLowerCase() : "";
      const zone = zones.find((item) => name.endsWith(`.${item.zone}`));
      const ascii = domainToASCII(name);
      if (
        !zone ||
        !ascii ||
        ascii.length > 253 ||
        ascii.split(".").length !== 2 ||
        !ascii
          .split(".")
          .every((label) =>
            /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label),
          )
      )
        throw new ApiError(
          400,
          "Введите корректный домен в зоне .ru, .рф, .com или .net.",
        );
      title = `Домен ${name} · регистрация на 1 год`;
      amount = zone.registration;
    } else throw new ApiError(400, "Выберите услугу.");
    const orderId = transaction(() => {
      const previous = db()
        .prepare("SELECT id FROM orders WHERE user_id=? AND request_key=?")
        .get(user.id, key) as { id: string } | undefined;
      if (previous) return previous.id;
      const id = randomUUID();
      db()
        .prepare(
          "INSERT INTO orders (id,user_id,title,amount,created,status,request_key) VALUES (?,?,?,?,?,'draft',?)",
        )
        .run(id, user.id, title, amount, new Date().toISOString(), key);
      logActivity(user.id, `Сохранён заказ: ${title}`);
      return id;
    });
    // No payment or provider request can be triggered by a draft order.
    return Response.json({
      id: orderId,
      status: "draft",
      message:
        "Заказ сохранён. Оплата и выдача услуг будут доступны после запуска.",
    });
  } catch (error) {
    return apiError(error);
  }
}
