import type { Metadata } from "next";
import "./fonts.css";
import "./globals.css";
import "./chrome.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://cloud.kernell.ru"),
  title: {
    default: "Kernell Cloud — домены и серверы для ваших проектов",
    template: "%s — Kernell Cloud",
  },
  description:
    "Домены и виртуальные серверы в одном личном кабинете Kernell Cloud.",
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>
        <a href="#main" className="skip-link">
          К содержимому
        </a>
        {children}
      </body>
    </html>
  );
}
