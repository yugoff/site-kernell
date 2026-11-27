import "server-only";
import { cloudSetting } from "./settings";

export type MailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

function publicOrigin(): string {
  return (cloudSetting("CLOUD_ORIGIN") || "https://cloud.kernell.ru").replace(
    /\/$/,
    "",
  );
}

/**
 * Dispatches transactional mail through a configured webhook gateway
 * (MAILER_WEBHOOK_URL). In early preview without a mail gateway, delivery is a no-op.
 */
export async function sendMail(message: MailMessage): Promise<boolean> {
  const webhookUrl = cloudSetting("MAILER_WEBHOOK_URL")?.trim();
  if (!webhookUrl) {
    return false;
  }

  const webhookToken = cloudSetting("MAILER_WEBHOOK_TOKEN")?.trim();
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(webhookToken ? { Authorization: `Bearer ${webhookToken}` } : {}),
    },
    body: JSON.stringify(message),
    cache: "no-store",
    redirect: "manual",
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) {
    throw new Error(`Mailer webhook failed with HTTP ${response.status}`);
  }
  return true;
}

export async function sendVerificationEmail(
  email: string,
  name: string,
  rawToken: string,
): Promise<boolean> {
  const url = `${publicOrigin()}/verify-email?token=${encodeURIComponent(rawToken)}`;
  return sendMail({
    to: email,
    subject: "Подтвердите email — Kernell Cloud",
    text: `Здравствуйте, ${name}!\n\nПодтвердите адрес электронной почты в Kernell Cloud по ссылке:\n${url}\n\nСсылка действует 24 часа.`,
  });
}

export async function sendPasswordResetEmail(
  email: string,
  name: string,
  rawToken: string,
): Promise<boolean> {
  const url = `${publicOrigin()}/reset-password?token=${encodeURIComponent(rawToken)}`;
  return sendMail({
    to: email,
    subject: "Восстановление пароля — Kernell Cloud",
    text: `Здравствуйте, ${name}!\n\nЧтобы задать новый пароль для аккаунта Kernell Cloud, перейдите по ссылке:\n${url}\n\nСсылка действует 30 минут. Если вы не запрашивали сброс пароля, просто проигнорируйте это письмо.`,
  });
}

