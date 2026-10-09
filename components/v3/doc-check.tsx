"use client";

import { useRef } from "react";
import { gsap, useGSAP, MQ } from "./gsap";

// Иллюстрация к кейсу «проверка логистических документов»: значения в документах и замечания —
// условный пример того, как выглядит результат; цифра −90% — из реального кейса.
const minis = [
  { type: "инвойс", rows: [["Вес брутто", "1 420 кг", true], ["Мест", "36", true], ["Договор", "№ 14/26", false]] },
  { type: "CMR", rows: [["Вес брутто", "1 240 кг", true], ["Мест", "38", false], ["Получатель", "✓", false]] },
  { type: "ТТН", rows: [["Договор", "—", true], ["Вес", "1 240 кг", false], ["Дата", "✓", false]] },
  { type: "упаковочный лист", rows: [["Мест", "38", true], ["Вес нетто", "1 180 кг", false], ["Позиций", "12", false]] },
] as const;

const remarks = [
  "Вес брутто: в CMR 1 240 кг, в инвойсе 1 420 кг",
  "Число мест: в упаковочном листе 38, в инвойсе 36",
  "В ТТН не указан номер договора",
];

const steps = [
  ["Загружаем документы", "Инвойсы, ТТН, CMR, упаковочные листы, сканы и PDF."],
  ["Распознаём и сверяем", "OCR и локальная LLM сопоставляют данные между документами."],
  ["Находим расхождения", "Каждое замечание — с пояснением и указанием на фрагмент документа."],
  ["Экономим время", "Время проверки документов сокращено на 90%."],
];

export function DocCheck() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const el = root.current!;
      const q = gsap.utils.selector(el);
      const mm = gsap.matchMedia();

      // Общие куски сцены, собираются в разные таймлайны для десктопа и телефона
      const meterNum = el.querySelector<HTMLElement>(".k3-meter-num b")!;
      // Досчитываем до 90; последний кадр совпадает с исходным текстом «−90%»
      const countTo = (tl: gsap.core.Timeline, at: string | number) => {
        const c = { v: 0 };
        tl.to(c, { v: 90, duration: 1, ease: "power2.out", onUpdate: () => void (meterNum.textContent = `−${Math.round(c.v)}%`) }, at);
      };
      const build = (tl: gsap.core.Timeline, withSteps: boolean) => {
        const li = q(".k3-demo-steps li");
        // Шаг слева «загорается», когда начинается его этап; раньше — приглушённый, но читаемый
        const activate = (i: number, at: string | number) => {
          if (withSteps) tl.fromTo(li[i], { color: "#b3a8aa" }, { color: "#f7f2ef", duration: 0.3 }, at);
        };
        const scan = q(".k3-scanline")[0];
        const docsBox = q(".k3-docs")[0];

        // 1. Загружаем документы
        activate(0, 0);
        tl.from(q(".k3-mini"), { y: 60, autoAlpha: 0, rotation: (i) => (i % 2 ? 4 : -4), duration: 1, stagger: 0.15 }, 0);
        tl.addLabel("loaded", "+=0.3");

        // 2. Распознаём и сверяем: сканер проходит сверху вниз, строки вспыхивают
        activate(1, "loaded");
        tl.fromTo(scan, { autoAlpha: 0, y: 0 }, { autoAlpha: 1, duration: 0.15 }, "loaded")
          .to(scan, { y: () => docsBox.offsetHeight, duration: 1.4, ease: "none" }, "loaded")
          .to(scan, { autoAlpha: 0, duration: 0.2 }, ">-0.1")
          // строки вспыхивают по мере прохода сканера и гаснут обратно
          .to(
            q(".k3-mini .k3-row:not(.is-bad)"),
            { keyframes: [{ backgroundColor: "rgba(227,160,171,0.35)", duration: 0.15 }, { backgroundColor: "rgba(227,160,171,0)", duration: 0.3 }], stagger: 0.08 },
            "loaded+=0.1",
          );
        tl.addLabel("scanned", "+=0.3");

        // 3. Находим расхождения: явные «до» и «после», чтобы не зависеть от порядка твинов
        activate(2, "scanned");
        tl.fromTo(
          q(".k3-mini .k3-row.is-bad"),
          { boxShadow: "inset 0 0 0 0px rgba(101,26,45,0)", backgroundColor: "rgba(101,26,45,0)", color: "#5d5557" },
          { boxShadow: "inset 0 0 0 1.5px rgba(101,26,45,1)", backgroundColor: "rgba(101,26,45,0.1)", color: "#651a2d", duration: 0.5, stagger: 0.1 },
          "scanned",
        )
          .fromTo(q(".k3-mini .k3-row.is-bad b"), { color: "#1d1a1b" }, { color: "#651a2d", duration: 0.5, stagger: 0.1 }, "scanned")
          .from(q(".k3-remarks"), { autoAlpha: 0, x: 40, duration: 0.5 }, "scanned")
          .from(q(".k3-remark"), { autoAlpha: 0, x: 24, duration: 0.5, stagger: 0.15 }, "scanned+=0.2");
        tl.addLabel("found", "+=0.3");

        // 4. Экономим время: шкала сжимается до 10%, цифра досчитывается и обводится
        activate(3, "found");
        tl.from(q(".k3-meter"), { autoAlpha: 0, y: 30, duration: 0.5 }, "found")
          .fromTo(q(".k3-meter-fill"), { scaleX: 1 }, { scaleX: 0.1, duration: 1, ease: "power2.inOut" }, "found+=0.2");
        countTo(tl, "found");
        tl.from(q(".k3-meter-num path"), { drawSVG: "0%", duration: 0.8, ease: "power2.inOut" }, "found+=1.1");
        tl.addLabel("saved", "+=0.2");
      };

      // Десктоп: сцена закреплена, прокрутка ведёт по этапам и мягко останавливается на каждом
      mm.add(MQ.desktop, () => {
        const tl = gsap.timeline({
          defaults: { ease: "power2.out" },
          scrollTrigger: {
            trigger: el,
            pin: el.querySelector(".k3-demo-pin"),
            start: "top top",
            end: "+=2600",
            scrub: 0.8,
            snap: { snapTo: "labelsDirectional", duration: { min: 0.2, max: 0.6 }, delay: 0.15, ease: "power1.inOut" },
          },
        });
        build(tl, true);
      });

      // Телефон: без закрепления — сцена проигрывается, когда доходит до экрана
      mm.add(MQ.mobile, () => {
        const tl = gsap.timeline({
          defaults: { ease: "power2.out" },
          scrollTrigger: { trigger: el.querySelector(".k3-stage"), start: "top 70%", toggleActions: "play none none none" },
        });
        build(tl, false);
        tl.timeScale(1.4);
      });
    },
    { scope: root },
  );

  return (
    <section className="k3-demo k3-dark" id="demo" ref={root} aria-labelledby="demo-title">
      <div className="k3-demo-pin">
        <div className="wrap">
          <div>
            <p className="k3-label">кейс · логистика · на серверах клиента</p>
            <h2 className="k3-h2" id="demo-title">
              ИИ сверяет документы. <em>Глаз не замыливается.</em>
            </h2>
            <ol className="k3-demo-steps">
              {steps.map(([title, text], i) => (
                <li key={title}>
                  <span className="n">0{i + 1}</span>
                  <b>{title}</b>
                  <span className="t">{text}</span>
                </li>
              ))}
            </ol>
          </div>

          <div className="k3-stage" aria-hidden="true">
            <div className="k3-docs">
              {minis.map((d) => (
                <div className="k3-mini" key={d.type}>
                  <span className="k3-doc-type">{d.type}</span>
                  {d.rows.map(([k, v, bad]) => (
                    <span className={`k3-row${bad ? " is-bad" : ""}`} key={k}>
                      {k}
                      <b>{v}</b>
                    </span>
                  ))}
                </div>
              ))}
              <div className="k3-scanline" />
            </div>

            <div className="k3-side">
              <div className="k3-card-dark k3-remarks">
                <span className="k3-mono-label">пример замечаний</span>
                <ul>
                  {remarks.map((r) => (
                    <li className="k3-remark" key={r}>
                      {r}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="k3-card-dark k3-meter">
                <span className="k3-mono-label">время проверки</span>
                <div className="k3-meter-track">
                  <div className="k3-meter-fill" />
                </div>
                <div className="k3-meter-scale">
                  <span>было · 100%</span>
                  <span>стало · 10%</span>
                </div>
                <div className="k3-meter-result">
                  <span className="k3-meter-num">
                    <b>−90%</b>
                    <svg viewBox="0 0 200 100" preserveAspectRatio="none">
                      <path d="M150 14C118 2 52 4 24 24 2 40 6 72 46 86c40 14 112 10 138-12 22-18 10-50-26-60-20-6-46-6-64-2" />
                    </svg>
                  </span>
                  <span className="k3-meter-cap">времени на проверку документов</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
