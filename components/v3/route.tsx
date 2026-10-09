"use client";

import { useRef } from "react";
import { gsap, SplitText, useGSAP, MQ, RU_CHARS, safeHandler } from "./gsap";
import { steps } from "@/lib/site-content";

/* Мини-иллюстрации граней: смысл шага, без цифр */
function MapVisual() {
  return (
    <svg viewBox="0 0 280 120" aria-hidden="true">
      {[
        ["процессы", 18],
        ["данные", 60],
        ["KPI", 102],
      ].map(([label, y]) => (
        <g key={label as string}>
          <rect x="0" y={(y as number) - 13} width="92" height="26" rx="13" className="v-pill" />
          <text x="46" y={(y as number) + 4} textAnchor="middle" className="v-text">
            {label}
          </text>
          <path d={`M92 ${y} C150 ${y} 160 60 206 60`} className="v-line" />
        </g>
      ))}
      <circle cx="232" cy="60" r="26" className="v-ring" />
      <circle cx="232" cy="60" r="14" className="v-ring" />
      <circle cx="232" cy="60" r="5" className="v-dot" />
    </svg>
  );
}

function ChartVisual() {
  return (
    <svg viewBox="0 0 280 120" aria-hidden="true">
      <path d="M8 112H272M8 112V8" className="v-axis" />
      <path d="M8 52H272" className="v-threshold" />
      <text x="16" y="70" className="v-text">
        порог эффекта
      </text>
      <path d="M8 100 C50 96 70 88 100 80 S150 66 175 52 230 22 262 16" className="v-line" />
      <circle cx="262" cy="16" r="5" className="v-dot" />
    </svg>
  );
}

function ProductVisual() {
  return (
    <svg viewBox="0 0 280 120" aria-hidden="true">
      <rect x="1" y="1" width="186" height="118" rx="10" className="v-window" />
      <circle cx="16" cy="14" r="3.5" className="v-dot" />
      <circle cx="28" cy="14" r="3.5" className="v-faint" />
      <circle cx="40" cy="14" r="3.5" className="v-faint" />
      <rect x="14" y="36" width="120" height="8" rx="4" className="v-faint" />
      <rect x="14" y="54" width="150" height="8" rx="4" className="v-faint" />
      <rect x="14" y="72" width="96" height="8" rx="4" className="v-faint" />
      <rect x="14" y="92" width="86" height="18" rx="9" className="v-pill" />
      <text x="57" y="105" textAnchor="middle" className="v-text">
        в продакшне
      </text>
      <path d="M236 34a26 26 0 1 1-24 16" className="v-line" />
      <path d="M206 44l6 7 8-5" className="v-line" />
      <text x="234" y="96" textAnchor="middle" className="v-text">
        обратная
      </text>
      <text x="234" y="111" textAnchor="middle" className="v-text">
        связь
      </text>
    </svg>
  );
}

const visuals = [MapVisual, ChartVisual, ProductVisual];

/**
 * «Как работаем»: трёхгранная призма — три шага, три грани. Прокрутка поворачивает её на 120° за шаг,
 * список слева подсвечивает текущий шаг, клик по шагу докручивает к нему.
 */
export function Route() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      mm.add({ desktop: MQ.desktop, mobile: MQ.mobile }, (ctx, contextSafe) => {
        const el = root.current!;
        const { desktop } = ctx.conditions!;
        const prism = el.querySelector<HTMLElement>(".k3-prism")!;
        const stage = el.querySelector<HTMLElement>(".k3-prism-stage")!;
        const shades = gsap.utils.toArray<HTMLElement>(".k3-face-shade", el);
        const items = gsap.utils.toArray<HTMLElement>(".k3-steps li", el);
        const buttons = gsap.utils.toArray<HTMLButtonElement>(".k3-step", el);
        el.classList.add("is-live");

        // Поворот хранится в объекте: от него считаем и наклон граней к свету, и текущий шаг
        const turn = { y: 0 };
        const render = () => {
          gsap.set(prism, { rotationY: turn.y });
          shades.forEach((s, i) => {
            const facing = Math.cos(((i * 120 + turn.y) * Math.PI) / 180);
            gsap.set(s, { opacity: (1 - Math.max(0, facing)) * 0.55 });
          });
          const active = gsap.utils.clamp(0, steps.length - 1, Math.round(-turn.y / 120));
          items.forEach((li, i) => li.classList.toggle("is-active", i === active));
        };
        render();

        // Доводка к соседней грани по направлению прокрутки. Стандартная доводка GSAP опирается на прогноз
        // инерции, и быстрый свайп на телефоне проскакивал среднюю грань.
        let tl: gsap.core.Timeline;
        const stepSnap = (predicted: number) => {
          const st = tl?.scrollTrigger;
          if (!st) return predicted;
          // положения граней на шкале прогресса — из меток s0, s1, s2
          const marks = steps.map((_, i) => tl.labels[`s${i}`] / tl.duration());
          const cur = st.progress;
          return st.direction > 0
            ? (marks.find((m) => m > cur + 0.001) ?? marks[marks.length - 1])
            : ([...marks].reverse().find((m) => m < cur - 0.001) ?? 0);
        };

        // Шаг → грань: поворот на 120°, на середине поворота призма чуть «отходит» назад
        tl = gsap.timeline({
          defaults: { ease: "power2.inOut" },
          scrollTrigger: desktop
            ? {
                trigger: el,
                pin: el.querySelector(".k3-how-pin"),
                start: "top top",
                end: "+=1800",
                scrub: 0.8,
                snap: { snapTo: (v: number) => stepSnap(v), duration: { min: 0.2, max: 0.6 }, delay: 0.1, ease: "power1.inOut" },
              }
            : // Телефон: без закрепления и доводки — прокрутка остаётся обычной. Поворот идёт ровно на том
              // отрезке, где призма видна целиком: от момента, когда она вся показалась снизу, и пока
              // её верх не дошёл до шапки.
              {
                trigger: stage,
                start: "bottom bottom",
                end: () => `+=${Math.max(240, window.innerHeight - stage.offsetHeight - 72)}`,
                scrub: 0.5,
                invalidateOnRefresh: true,
              },
        });
        tl.addLabel("s0", 0);
        steps.slice(1).forEach((_, k) => {
          const at = 0.3 + k * 1.3;
          tl.to(turn, { y: -120 * (k + 1), duration: 1, onUpdate: render }, at)
            .to(prism, { keyframes: { scale: [1, 0.9, 1] }, duration: 1, ease: "none" }, at)
            .addLabel(`s${k + 1}`, at + 1);
        });
        tl.to({}, { duration: 0.3 }); // пауза на последней грани, пока призма ещё целиком на экране

        // Клик по шагу — прокрутка до его грани
        const st = tl.scrollTrigger!;
        const offs = buttons.map((btn, i) => {
          const go = safeHandler(contextSafe, () => {
            const y = st.start + (st.end - st.start) * (tl.labels[`s${i}`] / tl.duration());
            window.scrollTo({ top: y, behavior: "smooth" });
          });
          btn.addEventListener("click", go);
          return () => btn.removeEventListener("click", go);
        });

        // Призма слегка покачивается сама, чтобы была «живой» и между шагами
        gsap.to(el.querySelector(".k3-prism-float"), { y: -10, rotationX: -4, duration: 2.6, ease: "sine.inOut", repeat: -1, yoyo: true });

        // Заголовок и «печатающийся» запрос
        const split = SplitText.create(el.querySelector(".k3-h2-line"), { type: "words", mask: "words" });
        gsap
          .timeline({ scrollTrigger: { trigger: el.querySelector(".k3-h2"), start: "top 80%" } })
          .from(split.words, { yPercent: 110, duration: 0.8, stagger: 0.06, ease: "power4.out" })
          .from(el.querySelector(".k3-h2 .k3-plate"), { scaleX: 0, duration: 0.6, ease: "power3.inOut" }, 0.25);
        const promptText = el.querySelector<HTMLElement>(".k3-prompt-text")!;
        const phrase = promptText.textContent ?? "";
        promptText.textContent = "";
        gsap.to(promptText, {
          duration: 1.6,
          ease: "none",
          scrambleText: { text: phrase, chars: RU_CHARS, revealDelay: 0.2, speed: 0.6 },
          scrollTrigger: { trigger: promptText, start: "top 85%" },
        });

        return () => {
          offs.forEach((off) => off());
          split.revert();
          promptText.textContent = phrase; // при откате анимаций фраза не должна пропасть
          el.classList.remove("is-live");
        };
      });
    },
    { scope: root },
  );

  return (
    <section className="k3-how" id="how" ref={root} aria-labelledby="how-title">
      <div className="k3-how-pin">
        <div className="wrap k3-how-grid">
          <div>
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
            <ol className="k3-steps" aria-label="Шаги работы">
              {steps.map((s) => (
                <li key={s.number}>
                  <button type="button" className="k3-step">
                    <span className="n">{s.number}</span>
                    <span className="t">{s.title}</span>
                    <span className="d">{s.text}</span>
                  </button>
                </li>
              ))}
            </ol>
            <p className="k3-note">
              Не знаете, с чего начать? Начните с <code>AI-аудита</code>: разберём процессы и данные и найдём, где ИИ даст
              наибольший эффект.
            </p>
          </div>

          <div className="k3-prism-stage" aria-hidden="true">
            <div className="k3-prism-float">
              <div className="k3-prism">
                {steps.map((s, i) => {
                  const Visual = visuals[i];
                  return (
                    <div className={`k3-face is-${i + 1}`} key={s.number} style={{ "--i": i } as React.CSSProperties}>
                      <span className="k3-face-num">
                        {s.number}
                        <small>шаг {i + 1} из 3</small>
                      </span>
                      <span className="k3-face-title">{s.title}</span>
                      <span className="k3-face-visual">
                        <Visual />
                      </span>
                      <span className="k3-face-shade" />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
