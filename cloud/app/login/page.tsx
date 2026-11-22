import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { currentUser } from "@cloud/lib/auth";
import { authDestination } from "@cloud/lib/navigation";
import { AuthForm } from "@cloud/components/auth-form";
export const metadata: Metadata = { title: "Вход в кабинет" };
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const next = authDestination(await searchParams);
  if (await currentUser()) redirect(next);
  return <AuthForm next={next} />;
}
