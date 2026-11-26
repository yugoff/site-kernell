import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { currentUser } from "@cloud/lib/auth";
import { ResetPasswordForm } from "@cloud/components/reset-password-form";

export const metadata: Metadata = { title: "Восстановление пароля" };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (await currentUser()) redirect("/dashboard");
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : undefined;
  return <ResetPasswordForm token={token} />;
}

