import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./v2.css";

const geist = Geist({
  subsets: ["latin", "cyrillic"],
  style: ["normal", "italic"],
  variable: "--font-geist",
});
const geistMono = Geist_Mono({
  subsets: ["latin", "cyrillic"],
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  title: "Kernell — ИИ, который окупается",
  description:
    "Находим, где ИИ действительно полезен бизнесу, и превращаем идею в работающий продукт. С фокусом на измеримый эффект.",
  openGraph: {
    title: "Kernell — ИИ, который окупается",
    description: "Находим, где ИИ полезен бизнесу, и превращаем идею в работающий продукт.",
    type: "website",
    locale: "ru_RU",
  },
  // Превью новой версии: не индексируем, чтобы не дублировать главную. При замене главной убрать.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#e26a3a" };

export default function V2Layout({ children }: { children: React.ReactNode }) {
  return <div className={`k2 ${geist.variable} ${geistMono.variable}`}>{children}</div>;
}
