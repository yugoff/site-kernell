"use client";

import { useEffect, useState } from "react";
import { useInView } from "@/lib/use-in-view";
import { cn } from "@/lib/utils";

const steps = [
  {
    number: "I",
    title: "Разбираемся в задаче",
    description: "Погружаемся в процессы, данные и KPI, чтобы найти точку максимального эффекта.",
    code: `audit.business({
  processes: 'analyze',
  data: 'connect',
  kpi: 'define'
})`,
  },
  {
    number: "II",
    title: "Проверяем гипотезу",
    description: "Запускаем быстрый PoC на реальных данных и измеряем, работает ли решение.",
    code: `poc.run({
  hypothesis: 'validate',
  data: 'real-world',
  metric: 'business-impact'
})`,
  },
  {
    number: "III",
    title: "Создаём и развиваем",
    description: "Превращаем подтверждённую гипотезу в рабочий продукт и масштабируем его вместе с бизнесом.",
    code: `product.deploy({
  target: 'production',
  feedback: 'continuous'
})

// Ready to scale`,
  },
];

const STEP_MS = 5000;

export function HowItWorksSection() {
  const [active, setActive] = useState(0);
  const { ref, visible } = useInView<HTMLElement>(0.1);

  // Перезапускается при клике, чтобы прогресс-полоска и таймер не расходились.
  useEffect(() => {
    const id = setInterval(() => setActive((i) => (i + 1) % steps.length), STEP_MS);
    return () => clearInterval(id);
  }, [active]);

  return (
    <section id="how-it-works" ref={ref} className="relative py-24 lg:py-32 bg-foreground text-background overflow-hidden">
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `repeating-linear-gradient(
              -45deg,
              transparent,
              transparent 40px,
              currentColor 40px,
              currentColor 41px
            )`,
          }}
        />
      </div>

      <div className="relative z-10 max-w-[1400px] mx-auto px-6 lg:px-12">
        <div className="mb-16 lg:mb-24">
          <span className="inline-flex items-center gap-3 text-sm font-mono text-background/50 mb-6">
            <span className="w-8 h-px bg-background/30" />
            Как работаем
          </span>
          <h2
            className={cn(
              "text-4xl lg:text-6xl font-display tracking-tight transition-all duration-700",
              visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4",
            )}
          >
            От задачи до результата.
            <br />
            <span className="text-background/50">С фокусом на эффект.</span>
          </h2>
        </div>

        <div className="grid lg:grid-cols-2 gap-16 lg:gap-24">
          <div className="space-y-0">
            {steps.map((step, i) => (
              <button
                key={step.number}
                type="button"
                onClick={() => setActive(i)}
                className={cn(
                  "w-full text-left py-8 border-b border-background/10 transition-all duration-500 group",
                  active === i ? "opacity-100" : "opacity-40 hover:opacity-70",
                )}
              >
                <div className="flex items-start gap-6">
                  <span className="font-display text-3xl text-background/30">{step.number}</span>
                  <div className="flex-1">
                    <h3 className="text-2xl lg:text-3xl font-display mb-3 group-hover:translate-x-2 transition-transform duration-300">
                      {step.title}
                    </h3>
                    <p className="text-background/60 leading-relaxed">{step.description}</p>
                    {active === i && (
                      <div className="mt-4 h-px bg-background/20 overflow-hidden">
                        <div
                          className="h-full bg-background w-0"
                          style={{ animation: `progress ${STEP_MS}ms linear forwards` }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>

          <div className="lg:sticky lg:top-32 self-start">
            <div className="border border-background/10 overflow-hidden">
              <div className="px-6 py-4 border-b border-background/10 flex items-center justify-between">
                <div className="flex gap-2">
                  <div className="w-3 h-3 rounded-full bg-background/20" />
                  <div className="w-3 h-3 rounded-full bg-background/20" />
                  <div className="w-3 h-3 rounded-full bg-background/20" />
                </div>
                <span className="text-xs font-mono text-background/40">workflow.ts</span>
              </div>
              <div className="p-8 font-mono text-sm min-h-[280px]">
                <pre className="text-background/70">
                  {steps[active].code.split("\n").map((line, lineIdx) => (
                    <div
                      key={`${active}-${lineIdx}`}
                      className="leading-loose code-line-reveal"
                      style={{ animationDelay: `${80 * lineIdx}ms` }}
                    >
                      <span className="text-background/20 select-none w-8 inline-block">{lineIdx + 1}</span>
                      <span className="inline-flex">
                        {line.split("").map((char, charIdx) => (
                          <span
                            key={`${active}-${lineIdx}-${charIdx}`}
                            className="code-char-reveal"
                            style={{ animationDelay: `${80 * lineIdx + 15 * charIdx}ms` }}
                          >
                            {char === " " ? " " : char}
                          </span>
                        ))}
                      </span>
                    </div>
                  ))}
                </pre>
              </div>
              <div className="px-6 py-4 border-t border-background/10 flex items-center gap-3">
                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                <span className="text-xs font-mono text-background/40">Ready</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
