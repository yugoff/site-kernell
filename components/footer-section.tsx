import { ArrowUpRight } from "lucide-react";
import { AsciiWave } from "@/components/ascii-canvas";
import { EMAIL, MAIL_DISCUSS, TELEGRAM_HANDLE, TELEGRAM_URL } from "@/lib/contact";

const links = [
  { name: EMAIL, href: `mailto:${EMAIL}` },
  { name: `Telegram ${TELEGRAM_HANDLE}`, href: TELEGRAM_URL, external: true },
  { name: "Что делаем", href: "#features" },
  { name: "Как работаем", href: "#how-it-works" },
  { name: "Вопросы", href: "#faq" },
];

export function FooterSection() {
  return (
    <footer className="relative border-t border-foreground/10">
      <div className="absolute inset-0 h-64 opacity-20 pointer-events-none overflow-hidden">
        <AsciiWave />
      </div>

      <div className="relative z-10 max-w-[1400px] mx-auto px-6 lg:px-12">
        <div className="py-16 lg:py-24">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 lg:gap-8">
            <div className="col-span-2">
              <a href="#" className="inline-flex items-center gap-2 mb-6">
                <span className="text-2xl font-display">Kernell</span>
                <span className="text-xs text-muted-foreground font-mono">TM</span>
              </a>
              <p className="text-muted-foreground leading-relaxed mb-8 max-w-xs">
                AI и ML для задач бизнеса: от аудита и проверки гипотез до создания рабочих решений.
              </p>
              <div className="flex flex-wrap gap-x-6 gap-y-3">
                {links.map((link) => (
                  <a
                    key={link.name}
                    href={link.href}
                    {...("external" in link ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 group"
                  >
                    {link.name}
                    <ArrowUpRight className="w-3 h-3 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                  </a>
                ))}
              </div>
            </div>

            <div className="flex items-start md:justify-end">
              <a
                href={MAIL_DISCUSS}
                className="group inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Написать нам
                <ArrowUpRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </a>
            </div>
          </div>
        </div>

        <div className="py-8 border-t border-foreground/10 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">© {new Date().getFullYear()} Kernell. Все права защищены.</p>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              Готовы обсудить задачу
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
