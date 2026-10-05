import type { Metadata } from "next";
import { Instrument_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const instrumentSans = Instrument_Sans({
  subsets: ["latin", "latin-ext"],
  variable: "--font-instrument",
});
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin", "latin-ext", "cyrillic"],
  variable: "--font-jetbrains",
});

export const metadata: Metadata = {
  openGraph: {
    title: "Kernell - AI-агентство для бизнеса",
    description: "Находим, где ИИ полезен бизнесу, и превращаем идею в работающий продукт.",
    type: "website",
    locale: "ru_RU",
  },
  title: "Kernell - AI-агентство для бизнеса",
  description:
    "AI и ML для задач бизнеса: от аудита и проверки гипотез до создания рабочих решений.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body
        className={`${instrumentSans.variable} ${jetbrainsMono.variable} font-sans antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
