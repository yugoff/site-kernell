import type { Metadata } from "next";
import { Instrument_Sans, JetBrains_Mono } from "next/font/google";

const instrumentSans = Instrument_Sans({
  subsets: ["latin", "latin-ext"],
  variable: "--font-instrument",
});
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin", "latin-ext", "cyrillic"],
  variable: "--font-jetbrains",
});

export const metadata: Metadata = {
  title: "Kernell - AI-агентство для бизнеса",
  description: "AI и ML для задач бизнеса: от аудита и проверки гипотез до создания рабочих решений.",
  // Прежняя версия сайта, доступна по прямой ссылке. Не индексируем.
  robots: { index: false, follow: false },
};

export default function V1Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${instrumentSans.variable} ${jetbrainsMono.variable} font-sans antialiased`}>{children}</div>
  );
}
