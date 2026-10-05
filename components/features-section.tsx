"use client";

import { useInView } from "@/lib/use-in-view";
import { cn } from "@/lib/utils";
import { AiVisual, CollabVisual, DeployVisual, SecurityVisual } from "@/components/feature-visuals";

const strengths = [
  {
    title: "Экспертиза",
    text: "Вся техническая команда — выпускники или студенты ведущих технических вузов России. Активно участвуем в AI-хакатонах и занимаем призовые места.",
  },
  { title: "Результат", text: "Связываем разработку с конкретной бизнес-задачей и измеримым эффектом." },
  {
    title: "Сотрудничество",
    text: "Строим долгосрочные отношения с клиентами и создаём основу для дальнейшего развития и роста бизнеса.",
  },
];

const features = [
  {
    number: "01",
    title: "Разрабатываем AI-продукты",
    description:
      "AI-ассистенты · AI-агенты · Работа с документами · Корпоративные знания и RAG · AI-прогнозирование · ML · Computer Vision",
    Visual: DeployVisual,
  },
  {
    number: "02",
    title: "Проверяем гипотезы",
    description:
      "Проводим быстрый PoC на реальных данных, чтобы определить эффективность идеи до полноценной разработки.",
    Visual: AiVisual,
  },
  {
    number: "03",
    title: "Проводим AI-аудит",
    description: "Разбираем бизнес-процессы и определяем, где внедрение ИИ может дать наибольший эффект.",
    Visual: CollabVisual,
  },
  {
    number: "04",
    title: "Работаем с бизнесом",
    description:
      "Работаем с компаниями, где есть сложные интеллектуальные процессы, большие объёмы данных и понятный экономический эффект.",
    Visual: SecurityVisual,
  },
];

function FeatureCard({ feature, index }: { feature: (typeof features)[number]; index: number }) {
  const { ref, visible } = useInView<HTMLDivElement>(0.2);
  const { Visual } = feature;

  return (
    <div
      ref={ref}
      className={cn(
        "group relative transition-all duration-700",
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-12",
      )}
      style={{ transitionDelay: `${100 * index}ms` }}
    >
      <div className="flex flex-col lg:flex-row gap-8 lg:gap-16 py-12 lg:py-20 border-b border-foreground/10">
        <div className="shrink-0">
          <span className="font-mono text-sm text-muted-foreground">{feature.number}</span>
        </div>
        <div className="flex-1 grid lg:grid-cols-2 gap-8 items-center">
          <div>
            <h3 className="text-3xl lg:text-4xl font-display mb-4 group-hover:translate-x-2 transition-transform duration-500">
              {feature.title}
            </h3>
            <p className="text-lg text-muted-foreground leading-relaxed">{feature.description}</p>
          </div>
          <div className="flex justify-center lg:justify-end">
            <div className="w-48 h-40 text-foreground">
              <Visual />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function FeaturesSection() {
  const { ref, visible } = useInView<HTMLElement>(0.1);

  return (
    <section id="features" ref={ref} className="relative py-24 lg:py-32">
      <div className="max-w-[1400px] mx-auto px-6 lg:px-12">
        <div className="mb-16 lg:mb-24">
          <span className="inline-flex items-center gap-3 text-sm font-mono text-muted-foreground mb-6">
            <span className="w-8 h-px bg-foreground/30" />
            Что делаем
          </span>
          <h2
            className={cn(
              "text-4xl lg:text-6xl font-display tracking-tight transition-all duration-700",
              visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4",
            )}
          >
            AI-решения под задачи бизнеса
            <br />
            <span className="text-muted-foreground">От гипотезы до рабочего продукта.</span>
          </h2>
        </div>

        <div className="mb-24 border-y border-foreground/10 py-12 lg:py-16">
          <div className="mb-10">
            <span className="text-sm font-mono text-muted-foreground">В чём мы хороши</span>
          </div>
          <div className="grid gap-10 lg:grid-cols-3 lg:gap-12">
            {strengths.map((item) => (
              <div key={item.title}>
                <h3 className="mb-4 text-2xl font-display">{item.title}</h3>
                <p className="text-base leading-relaxed text-muted-foreground">{item.text}</p>
              </div>
            ))}
          </div>
        </div>

        <div>
          {features.map((feature, index) => (
            <FeatureCard key={feature.number} feature={feature} index={index} />
          ))}
        </div>
      </div>
    </section>
  );
}
