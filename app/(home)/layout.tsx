import type { Viewport } from "next";
import { HomeShell } from "@/components/home/shell";

// Главная — интерактивная версия. Заголовок и описание берутся из корневого layout.
export const viewport: Viewport = { themeColor: "#f7f3ee" };

export default function HomeLayout({ children }: { children: React.ReactNode }) {
  return <HomeShell>{children}</HomeShell>;
}
