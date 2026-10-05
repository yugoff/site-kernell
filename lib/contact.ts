export const EMAIL = "vv.yugoff@gmail.com";
export const TELEGRAM_HANDLE = "@timm_ai";
export const TELEGRAM_URL = "https://t.me/timm_ai";

export function mailto(subject: string, body = "") {
  const params = new URLSearchParams({ subject, body });
  // URLSearchParams кодирует пробел как "+", а в mailto нужен %20.
  return `mailto:${EMAIL}?${params.toString().replace(/\+/g, "%20")}`;
}

export const MAIL_DISCUSS = mailto(
  "Обсудить задачу",
  "Здравствуйте!\n\nХотим обсудить задачу:\n\nКомпания:\nКратко о задаче:\n",
);
export const MAIL_HYPOTHESIS = mailto(
  "Проверка гипотезы (PoC)",
  "Здравствуйте!\n\nХотим проверить гипотезу:\n\nГипотеза:\nКакие данные есть:\nКакой эффект ожидаем:\n",
);
