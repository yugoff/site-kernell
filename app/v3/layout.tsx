import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./v3.css";

const geist = Geist({ subsets: ["latin", "cyrillic"], variable: "--font-geist" });
const geistMono = Geist_Mono({ subsets: ["latin", "cyrillic"], variable: "--font-geist-mono" });

export const metadata: Metadata = {
  title: "Kernell — ИИ, который окупается",
  description:
    "Находим, где ИИ действительно полезен бизнесу, и превращаем идею в работающий продукт. С фокусом на измеримый эффект.",
  // Превью интерактивной версии: не индексируем, чтобы не дублировать главную.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#f7f3ee" };

export default function V3Layout({ children }: { children: React.ReactNode }) {
  return <div className={`k3 ${geist.variable} ${geistMono.variable}`}>{children}</div>;
}
