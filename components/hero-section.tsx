"use client";

import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/button";
import { AsciiSphere } from "@/components/ascii-canvas";
import { cn } from "@/lib/utils";
import { MAIL_DISCUSS, MAIL_HYPOTHESIS } from "@/lib/contact";

const stats = [
  { value: "PoC", label: "на реальных данных", tag: "БЫСТРЫЙ СТАРТ" },
  { value: "AI", label: "для процессов бизнеса", tag: "ПРИКЛАДНЫЕ РЕШЕНИЯ" },
  { value: "ML", label: "для прогнозов и данных", tag: "ДАННЫЕ И МОДЕЛИ" },
  { value: "ROI", label: "в центре каждого решения", tag: "ИЗМЕРИМЫЙ ЭФФЕКТ" },
  { value: "KPI", label: "Привязываем решение к KPI бизнеса", tag: "БИЗНЕС-ОРИЕНТИР" },
];

export function HeroSection() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const reveal = (hidden: string) => (mounted ? "opacity-100 translate-y-0" : hidden);

  return (
    <section className="relative min-h-screen flex flex-col justify-center overflow-hidden">
      <div className="absolute right-0 top-1/2 -translate-y-1/2 w-[600px] h-[600px] lg:w-[800px] lg:h-[800px] opacity-40 pointer-events-none">
        <AsciiSphere />
      </div>

      <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-30">
        {[...Array(8)].map((_, i) => (
          <div key={`h-${i}`} className="absolute h-px bg-foreground/10" style={{ top: `${12.5 * (i + 1)}%`, left: 0, right: 0 }} />
        ))}
        {[...Array(12)].map((_, i) => (
          <div key={`v-${i}`} className="absolute w-px bg-foreground/10" style={{ left: `${8.33 * (i + 1)}%`, top: 0, bottom: 0 }} />
        ))}
      </div>

      <div className="relative z-10 max-w-[1400px] mx-auto px-6 lg:px-12 py-32 lg:py-40">
        <div className={cn("mb-8 transition-all duration-700", reveal("opacity-0 translate-y-4"))}>
          <span className="inline-flex items-center gap-3 text-sm font-mono text-muted-foreground">
            <span className="w-8 h-px bg-foreground/30" />
            AI и ML для задач бизнеса
          </span>
        </div>

        <div className="mb-12">
          <h1 className="text-[clamp(2.5rem,6.5vw,6rem)] font-display leading-[0.96] tracking-tight">
            Находим, где ИИ действительно полезен бизнесу — и превращаем идею в работающий продукт.
          </h1>
        </div>

        <div className="grid lg:grid-cols-2 gap-12 lg:gap-24 items-end">
          <p
            className={cn(
              "text-xl lg:text-2xl text-muted-foreground leading-relaxed max-w-xl transition-all duration-700 delay-200",
              reveal("opacity-0 translate-y-4"),
            )}
          >
            Разрабатываем и интегрируем AI и ML-решения под конкретные задачи бизнеса — с фокусом на измеримый экономический эффект.
          </p>

          <div
            className={cn(
              "flex flex-col sm:flex-row items-start gap-4 transition-all duration-700 delay-300",
              reveal("opacity-0 translate-y-4"),
            )}
          >
            <Button href={MAIL_DISCUSS} size="lg" className="bg-foreground hover:bg-foreground/90 text-background px-8 h-14 text-base rounded-full group">
              Обсудить задачу
              <ArrowRight className="w-4 h-4 ml-2 transition-transform group-hover:translate-x-1" />
            </Button>
            <Button
              href={MAIL_HYPOTHESIS}
              size="lg"
              variant="outline"
              className="h-14 px-8 text-base rounded-full border-foreground/20 hover:bg-foreground/5"
            >
              Проверить гипотезу
            </Button>
          </div>
        </div>
      </div>

      <div
        className={cn(
          "absolute bottom-16 left-0 right-0 transition-all duration-700 delay-500",
          mounted ? "opacity-100" : "opacity-0",
        )}
      >
        <div className="flex gap-16 marquee whitespace-nowrap">
          {[0, 1].map((copy) => (
            <div key={copy} className="flex gap-16">
              {stats.map((stat) => (
                <div key={stat.value} className="flex items-baseline gap-4">
                  <span className="text-3xl lg:text-4xl font-display">{stat.value}</span>
                  <span className="text-xs text-muted-foreground">
                    {stat.label}
                    <span className="block font-mono text-[10px] mt-1">{stat.tag}</span>
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
