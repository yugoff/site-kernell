import { Geist, Geist_Mono } from "next/font/google";
import "./home.css";

const geist = Geist({ subsets: ["latin", "cyrillic"], variable: "--font-geist" });
const geistMono = Geist_Mono({ subsets: ["latin", "cyrillic"], variable: "--font-geist-mono" });

/** Оболочка интерактивной версии: шрифты Geist, стили и корневой класс .k3. Используется на главной странице. */
export function HomeShell({ children }: { children: React.ReactNode }) {
  return <div className={`k3 ${geist.variable} ${geistMono.variable}`}>{children}</div>;
}
