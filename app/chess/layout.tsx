import type { Metadata, Viewport } from "next";
import { K3Shell } from "@/components/v3/shell";
import "./chess.css";

export const metadata: Metadata = {
  title: "Kernell Chess — шахматный турнир",
  description: "Игроки, жеребьёвка, результаты и таблица очков. Всё для вашего шахматного турнира в одной вкладке.",
  openGraph: {
    title: "Kernell Chess — шахматный турнир",
    description: "Проводите турнир: добавляйте игроков, отмечайте результаты и формируйте следующие туры.",
    type: "website",
    locale: "ru_RU",
  },
};
export const viewport: Viewport = { themeColor: "#f7f3ee" };

export default function ChessLayout({ children }: { children: React.ReactNode }) {
  return <K3Shell>{children}</K3Shell>;
}
