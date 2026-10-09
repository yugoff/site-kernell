import type { Viewport } from "next";
import { K3Shell } from "@/components/v3/shell";

// Главная — интерактивная версия. Заголовок и описание берутся из корневого layout.
export const viewport: Viewport = { themeColor: "#f7f3ee" };

export default function HomeLayout({ children }: { children: React.ReactNode }) {
  return <K3Shell>{children}</K3Shell>;
}
