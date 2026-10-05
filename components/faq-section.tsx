"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { useInView } from "@/lib/use-in-view";
import { cn } from "@/lib/utils";

const faq = [
  {
    q: "С чего начать, если мы не знаем, где нам нужен ИИ?",
    a: "С AI-аудита: разбираем ваши процессы и данные, находим места, где ИИ даст максимальный эффект, и оцениваем реалистичность каждой идеи.",
  },
  {
    q: "Что такое PoC и зачем он нужен?",
    a: "Это быстрый прототип на ваших реальных данных. Он показывает, работает ли идея, ещё до вложений в полноценную разработку.",
  },
  {
    q: "Какие задачи вы решаете?",
    a: "AI-ассистенты и агенты, работа с документами и корпоративными знаниями (RAG), прогнозирование и ML, Computer Vision.",
  },
  {
    q: "Как мы будем работать вместе?",
    a: "Сначала обсуждаем задачу и KPI, затем проверяем гипотезу на PoC, после чего создаём и развиваем продукт. На каждом этапе вы видите результат.",
  },
  {
    q: "Как с вами связаться?",
    a: "Напишите в Telegram @timm_ai или на vv.yugoff@gmail.com — расскажите о задаче, и мы предложим следующий шаг.",
  },
];

export function FaqSection() {
  const [open, setOpen] = useState<number | null>(0);
  const { ref, visible } = useInView<HTMLElement>(0.1);

  return (
    <section id="faq" ref={ref} className="relative py-24 lg:py-32 border-t border-foreground/10">
      <div className="max-w-[1400px] mx-auto px-6 lg:px-12 grid lg:grid-cols-12 gap-12 lg:gap-20">
        <div className="lg:col-span-5">
          <span className="inline-flex items-center gap-3 text-sm font-mono text-muted-foreground mb-6">
            <span className="w-8 h-px bg-foreground/30" />
            Вопросы
          </span>
          <h2
            className={cn(
              "text-4xl lg:text-6xl font-display tracking-tight transition-all duration-700",
              visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4",
            )}
          >
            Частые вопросы
          </h2>
        </div>

        <div className="lg:col-span-7">
          {faq.map((item, i) => {
            const isOpen = open === i;
            return (
              <div key={item.q} className="border-b border-foreground/10">
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => setOpen(isOpen ? null : i)}
                  className="w-full flex items-center justify-between gap-6 py-6 text-left group"
                >
                  <span className="text-xl lg:text-2xl font-display group-hover:translate-x-1 transition-transform duration-300">
                    {item.q}
                  </span>
                  <Plus
                    className={cn("w-5 h-5 shrink-0 text-muted-foreground transition-transform duration-300", isOpen && "rotate-45")}
                  />
                </button>
                <div
                  className={cn(
                    "grid transition-all duration-500",
                    isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
                  )}
                >
                  <div className="overflow-hidden">
                    <p className="pb-6 text-lg text-muted-foreground leading-relaxed max-w-2xl">{item.a}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
