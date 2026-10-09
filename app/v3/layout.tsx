import type { Metadata, Viewport } from "next";
import { K3Shell } from "@/components/v3/shell";

export const metadata: Metadata = {
  // Та же страница, что и главная, — оставлена, чтобы не сломались старые ссылки на /v3. Не индексируем.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#f7f3ee" };

export default function V3Layout({ children }: { children: React.ReactNode }) {
  return <K3Shell>{children}</K3Shell>;
}
