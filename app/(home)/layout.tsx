import type { Metadata, Viewport } from "next";
import { K3Shell } from "@/components/v3/shell";
import { metadata as chessMetadata } from "../chess/layout";

export const metadata: Metadata = process.env.KERNELL_CHESS === "1" ? chessMetadata : {};

// Главная — интерактивная версия. Заголовок и описание берутся из корневого layout.
export const viewport: Viewport = { themeColor: "#f7f3ee" };

export default function HomeLayout({ children }: { children: React.ReactNode }) {
  return <K3Shell>{children}</K3Shell>;
}
