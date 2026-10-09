import { Geist, Geist_Mono } from "next/font/google";
import "./v3.css";

const geist = Geist({ subsets: ["latin", "cyrillic"], variable: "--font-geist" });
const geistMono = Geist_Mono({ subsets: ["latin", "cyrillic"], variable: "--font-geist-mono" });

/** Оболочка интерактивной версии: шрифты Geist, стили и корневой класс .k3. Нужна главной и /v3. */
export function K3Shell({ children }: { children: React.ReactNode }) {
  return <div className={`k3 ${geist.variable} ${geistMono.variable}`}>{children}</div>;
}
