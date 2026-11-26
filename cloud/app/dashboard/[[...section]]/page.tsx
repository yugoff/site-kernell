import { notFound } from "next/navigation";
import { requireUser } from "@cloud/lib/auth";
import { accountFor } from "@cloud/lib/database";
import { sections, type Section } from "@cloud/lib/catalog";
import { Dashboard } from "@cloud/components/dashboard";

export default async function DashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ section?: string[] }>;
  searchParams: Promise<{ create?: string; payment?: string }>;
}) {
  const user = await requireUser();
  const segments = (await params).section || [];
  const section = segments[0] || "overview";
  if (segments.length > 1 || !sections.includes(section as Section)) notFound();
  const query = await searchParams;
  return (
    <Dashboard
      key={section}
      initial={accountFor(user)}
      section={section as Section}
      initialCreate={query.create}
      initialPaymentId={query.payment}
    />
  );
}
