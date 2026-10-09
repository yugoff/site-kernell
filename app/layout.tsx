import type { Metadata } from "next";
import "./globals.css";

// Описание главной (интерактивная версия). Подстраницы /v1, /v2, /v3 переопределяют его и закрыты от индексации.
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
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body className="antialiased">{children}</body>
    </html>
  );
}
