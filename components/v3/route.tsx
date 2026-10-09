"use client";

import { useRef } from "react";
import { gsap, SplitText, useGSAP, MQ, RU_CHARS } from "./gsap";
import { steps } from "@/lib/site-content";

/** «Как работаем»: линия маршрута прорисовывается при прокрутке, по ней едет точка, шаги выезжают навстречу. */
export function Route() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      mm.add({ motion: MQ.motion, wide: "(min-width: 761px)" }, (ctx) => {
        if (!ctx.conditions!.motion) return;
        const el = root.current!;
        const route = el.querySelector<HTMLElement>(".k3-route")!;
        const dot = el.querySelector<HTMLElement>(".k3-route-dot")!;
        const wide = ctx.conditions!.wide;

        // Заголовок: строка поднимается из-под маски, плашка раскрывается
        const split = SplitText.create(el.querySelector(".k3-h2-line"), { type: "words", mask: "words" });
        const head = gsap.timeline({ scrollTrigger: { trigger: el.querySelector(".k3-h2"), start: "top 80%" } });
        head
          .from(split.words, { yPercent: 110, duration: 0.8, stagger: 0.06, ease: "power4.out" })
          .from(el.querySelector(".k3-h2 .k3-plate"), { scaleX: 0, duration: 0.6, ease: "power3.inOut" }, 0.25);

        // Запрос «печатается» из случайных букв
        const promptText = el.querySelector<HTMLElement>(".k3-prompt-text")!;
        const phrase = promptText.textContent ?? "";
        promptText.textContent = "";
        gsap.to(promptText, {
          duration: 1.6,
          ease: "none",
          scrambleText: { text: phrase, chars: RU_CHARS, revealDelay: 0.2, speed: 0.6 },
          scrollTrigger: { trigger: promptText, start: "top 85%" },
        });

        // Линия и точка привязаны к прокрутке
        gsap.set(dot, { visibility: "visible" });
        const line = gsap.timeline({
          defaults: { ease: "none" },
          scrollTrigger: { trigger: route, start: "top 60%", end: "bottom 60%", scrub: 0.6 },
        });
        line
          .fromTo(el.querySelector(".k3-route-fill"), { scaleY: 0 }, { scaleY: 1 }, 0)
          .fromTo(dot, { y: 0 }, { y: () => route.offsetHeight }, 0);

        // Каждый шаг выезжает со своей стороны, когда точка к нему подходит
        gsap.utils.toArray<HTMLElement>(".k3-station", el).forEach((station, i) => {
          const fromX = wide ? (i % 2 ? 60 : -60) : 40;
          gsap
            .timeline({ scrollTrigger: { trigger: station, start: "top 62%", toggleActions: "play none none reverse" } })
            .from(station.querySelector(".k3-station-node"), { scale: 0, duration: 0.4, ease: "back.out(3)" })
            .from(station.querySelector(".k3-station-card"), { x: fromX, autoAlpha: 0, duration: 0.7, ease: "power3.out" }, 0);
        });

        return () => {
          split.revert();
          promptText.textContent = phrase; // при откате анимаций фраза не должна пропасть
        };
      });
    },
    { scope: root },
  );

  return (
    <section className="k3-how k3-section" id="how" ref={root} aria-labelledby="how-title">
      <div className="wrap">
        <p className="k3-label">как работаем · 3 шага</p>
        <h2 className="k3-h2" id="how-title">
          <span className="k3-h2-line">От задачи</span> <span className="k3-plate">до результата.</span>
        </h2>
        <p className="k3-ask">
          <span className="k3-ask-lead">Начать можно с одной фразы:</span>
          <span className="k3-ask-prompt">
            <span className="p" aria-hidden="true">
              &gt;
            </span>
            <span className="k3-prompt-text">хотим понять, где нам нужен ИИ.</span>
            <span className="k3-caret" aria-hidden="true" />
          </span>
        </p>

        <div className="k3-route">
          <span className="k3-route-line" aria-hidden="true">
            <span className="k3-route-fill" />
          </span>
          <span className="k3-route-dot" aria-hidden="true" />
          <ol className="k3-stations" aria-label="Шаги работы">
          {steps.map((s) => (
            <li className="k3-station" key={s.number}>
              <span className="k3-station-node" aria-hidden="true" />
              <div className="k3-station-card">
                <span className="k3-station-num">{s.number}</span>
                <h3 className="k3-station-title">{s.title}</h3>
                <p className="k3-station-text">{s.text}</p>
              </div>
            </li>
          ))}
          </ol>
        </div>

        <p className="k3-note">
          Не знаете, с чего начать? Начните с <code>AI-аудита</code>: разберём процессы и данные и найдём, где ИИ даст
          наибольший эффект.
        </p>
      </div>
    </section>
  );
}
