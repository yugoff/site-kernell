"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const cases = [
  {
    title: "AI-ассистент для работы с корпоративными документами",
    category: "AI-продукты · RAG",
    description: "Поиск по внутренней базе знаний и ответы со ссылками на источники.",
    outcome: "Быстрый доступ к знаниям компании",
  },
  {
    title: "AI-прогнозирование для поддержки управленческих решений",
    category: "ML · Прогнозирование",
    description: "Модели спроса, нагрузки и рисков на данных вашего бизнеса.",
    outcome: "Решения на основе данных, а не интуиции",
  },
  {
    title: "Автоматизация сложного интеллектуального процесса",
    category: "AI-агенты",
    description: "Агенты, которые берут на себя рутину: разбор заявок, документов, обращений.",
    outcome: "Освобождаем время команды для важного",
  },
  {
    title: "Computer Vision для контроля и анализа изображений",
    category: "Computer Vision",
    description: "Распознавание объектов, дефектов и текста на фото и видео.",
    outcome: "Контроль качества без ручной рутины",
  },
];

const stack = [
  "Python",
  "PyTorch",
  "LLM",
  "RAG",
  "AI-агенты",
  "Computer Vision",
  "NLP",
  "MLOps",
];

const pad = (n: number) => String(n).padStart(2, "0");

export function CasesSection() {
  const [active, setActive] = useState(0);
  const [fading, setFading] = useState(false);

  const goTo = (index: number) => {
    setFading(true);
    setTimeout(() => {
      setActive(index);
      setFading(false);
    }, 300);
  };

  // Автопереключение каждые 5 секунд; сбрасывается при ручном выборе.
  useEffect(() => {
    const id = setInterval(() => goTo((active + 1) % cases.length), 5000);
    return () => clearInterval(id);
  }, [active]);

  const current = cases[active];

  return (
    <section id="cases" className="relative py-32 lg:py-40 border-t border-foreground/10 lg:pb-14">
      <div className="max-w-7xl mx-auto px-6 lg:px-12">
        <div className="flex items-center gap-4 mb-16">
          <span className="font-mono text-xs tracking-widest text-muted-foreground uppercase">Решения</span>
          <div className="flex-1 h-px bg-foreground/10" />
          <span className="font-mono text-xs text-muted-foreground">
            {pad(active + 1)} / {pad(cases.length)}
          </span>
        </div>

        <div className="grid lg:grid-cols-12 gap-12 lg:gap-20">
          <div className="lg:col-span-8">
            <blockquote
              className={cn("transition-all duration-300", fading ? "opacity-0 translate-y-4" : "opacity-100 translate-y-0")}
            >
              <p className="font-display text-4xl md:text-5xl lg:text-5xl leading-[1.1] tracking-tight text-foreground">
                {current.title}
              </p>
            </blockquote>

            <div
              className={cn("mt-12 flex items-center gap-6 transition-all duration-300 delay-100", fading ? "opacity-0" : "opacity-100")}
            >
              <div className="w-16 h-16 rounded-full bg-foreground/5 border border-foreground/10 flex items-center justify-center">
                <span className="font-mono text-sm text-foreground">{pad(active + 1)}</span>
              </div>
              <div>
                <p className="text-lg font-medium text-foreground">{current.category}</p>
                <p className="text-muted-foreground">
                  {current.description}
                </p>
              </div>
            </div>
          </div>

          <div className="lg:col-span-4 flex flex-col justify-center">
            <div
              className={cn("p-8 border border-foreground/10 transition-all duration-300", fading ? "opacity-0 scale-95" : "opacity-100 scale-100")}
            >
              <span className="font-mono text-xs tracking-widest text-muted-foreground uppercase block mb-4">Что даёт бизнесу</span>
              <p className="font-display text-3xl md:text-4xl text-foreground">{current.outcome}</p>
            </div>

            <div className="flex gap-2 mt-8">
              {cases.map((_, i) => (
                <button
                  key={i}
                  aria-label={`Решение ${i + 1}`}
                  onClick={() => goTo(i)}
                  className={cn(
                    "h-2 transition-all duration-300",
                    i === active ? "w-8 bg-foreground" : "w-2 bg-foreground/20 hover:bg-foreground/40",
                  )}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="mt-24 pt-12 border-t border-foreground/10">
          <p className="font-mono text-xs tracking-widest text-muted-foreground uppercase mb-8 text-center">
            Технологии, с которыми работаем
          </p>
        </div>
      </div>

      <div className="w-full">
        <div className="flex gap-16 items-center marquee">
          {[0, 1].map((copy) => (
            <div key={copy} className="flex gap-16 items-center shrink-0">
              {stack.map((name) => (
                <span
                  key={name}
                  className="font-display text-xl md:text-2xl text-foreground/30 whitespace-nowrap hover:text-foreground transition-colors duration-300"
                >
                  {name}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
