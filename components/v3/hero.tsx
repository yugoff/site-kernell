"use client";

import { useRef } from "react";
import { gsap, SplitText, useGSAP, MQ, RU_CHARS, safeHandler } from "./gsap";
import { industries } from "@/lib/site-content";
import { MAIL_HYPOTHESIS } from "@/lib/contact";

function Arrow() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

// Документы в стопке — иллюстрация к кейсу с логистикой (значения условные).
const docs = [
  { type: "упаковочный лист", rows: [["Мест", "38"], ["Вес нетто", "1 180 кг"]] },
  { type: "ТТН", rows: [["Договор", "—"], ["Вес", "1 240 кг"]] },
  { type: "CMR", rows: [["Вес брутто", "1 240 кг"], ["Мест", "38"]] },
  { type: "инвойс", rows: [["Вес брутто", "1 420 кг"], ["Мест", "36"], ["Договор", "№ 14/26"]], bad: 0 },
];

export function Hero() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      mm.add(MQ.motion, () => {
        const el = root.current!;
        const line = el.querySelector<HTMLElement>(".k3-h1-line")!;
        const plate = el.querySelector<HTMLElement>(".k3-plate")!;
        const plateText = plate.querySelector<HTMLElement>("span")!;
        const word = plateText.textContent ?? "";
        const stack = el.querySelector<HTMLElement>(".k3-stack")!;
        const cards = gsap.utils.toArray<HTMLElement>(".k3-doc", el);
        const scan = el.querySelector<HTMLElement>(".k3-scan")!;
        const badge = el.querySelector<HTMLElement>(".k3-badge")!;
        const split = SplitText.create(line, { type: "words", mask: "words" });

        // Ширину плашки фиксируем, чтобы она не дрожала, пока буквы перебираются
        gsap.set(plate, { width: plate.offsetWidth });

        const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
        tl.fromTo(line, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.01 }, 0)
          .fromTo(split.words, { yPercent: 110 }, { yPercent: 0, duration: 0.9, stagger: 0.07, ease: "power4.out" }, 0)
          .fromTo(plate, { autoAlpha: 0, scaleX: 0 }, { autoAlpha: 1, scaleX: 1, duration: 0.6, ease: "power3.inOut" }, 0.35)
          .fromTo(
            plateText,
            { autoAlpha: 0 },
            { autoAlpha: 1, duration: 1.1, ease: "none", scrambleText: { text: word, chars: RU_CHARS, revealDelay: 0.3, speed: 0.5 } },
            0.75,
          )
          .set(plate, { clearProps: "width" })
          .fromTo(
            el.querySelectorAll(".k3-eyebrow, .k3-sub, .k3-industries, .k3-actions"),
            { autoAlpha: 0, y: 24 },
            { autoAlpha: 1, y: 0, duration: 0.8, stagger: 0.08 },
            0.6,
          )
          .fromTo(stack, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.3 }, 0.45)
          .from(cards, { y: 120, rotation: 12, autoAlpha: 0, duration: 1, stagger: 0.12, ease: "power3.out" }, 0.45)
          .fromTo(badge, { autoAlpha: 0, scale: 0.8 }, { autoAlpha: 1, scale: 1, duration: 0.5, ease: "back.out(2)" }, 1.6);

        // Сканер бежит по верхнему документу туда и обратно
        const top = cards[cards.length - 1];
        gsap.fromTo(
          scan,
          { autoAlpha: 0, y: 0 },
          {
            autoAlpha: 1,
            y: () => top.offsetHeight * 0.55,
            duration: 2.2,
            ease: "sine.inOut",
            repeat: -1,
            yoyo: true,
            delay: 1.4,
          },
        );

        return () => split.revert();
      });

      // Мышь: стопка поворачивается к курсору, листы смещаются на разную глубину
      mm.add(MQ.finePointer, (_ctx, contextSafe) => {
        const el = root.current!;
        const inner = el.querySelector<HTMLElement>(".k3-stack-inner")!;
        const cards = gsap.utils.toArray<HTMLElement>(".k3-doc", el);
        const rotY = gsap.quickTo(inner, "rotationY", { duration: 0.9, ease: "power3" });
        const rotX = gsap.quickTo(inner, "rotationX", { duration: 0.9, ease: "power3" });
        const xs = cards.map((c) => gsap.quickTo(c, "x", { duration: 0.9, ease: "power3" }));
        const ys = cards.map((c) => gsap.quickTo(c, "y", { duration: 0.9, ease: "power3" }));

        const onMove = safeHandler(contextSafe, (e: PointerEvent) => {
          const nx = (e.clientX / window.innerWidth) * 2 - 1;
          const ny = (e.clientY / window.innerHeight) * 2 - 1;
          rotY(nx * 10);
          rotX(-ny * 7);
          cards.forEach((_, i) => {
            const depth = (i + 1) / cards.length;
            xs[i](nx * 18 * depth);
            ys[i](ny * 12 * depth);
          });
        });
        window.addEventListener("pointermove", onMove);
        return () => window.removeEventListener("pointermove", onMove);
      });

      // Сенсорные экраны: стопка мягко покачивается сама
      mm.add("(pointer: coarse) and (prefers-reduced-motion: no-preference)", () => {
        gsap.to(root.current!.querySelector(".k3-stack-inner"), {
          rotationY: 8,
          rotationX: -4,
          duration: 4,
          ease: "sine.inOut",
          repeat: -1,
          yoyo: true,
        });
      });
    },
    { scope: root },
  );

  return (
    <section className="k3-hero" id="top" ref={root}>
      <div className="wrap">
        <div>
          <p className="k3-eyebrow" data-intro>
            <i aria-hidden="true" />
            kernell · AI и ML для задач бизнеса
          </p>
          <h1 className="k3-h1" aria-label="ИИ, который окупается.">
            <span className="k3-h1-line" data-intro aria-hidden="true">
              ИИ, который
            </span>
            <span className="k3-plate" data-intro aria-hidden="true">
              <span>окупается.</span>
            </span>
          </h1>
          <p className="k3-sub" data-intro>
            Находим, где ИИ действительно полезен бизнесу, и превращаем идею в <strong>работающий продукт</strong>.
          </p>
          <p className="k3-industries" data-intro>
            <span className="k3-industries-label">проекты в отраслях:</span>
            {industries.map((name) => (
              <span key={name} className="k3-industry">
                {name}
              </span>
            ))}
          </p>
          <div className="k3-actions" data-intro>
            <a className="k3-btn" href={MAIL_HYPOTHESIS}>
              проверить гипотезу
              <Arrow />
            </a>
            <a className="k3-btn is-ghost" href="#demo">
              как это работает ↓
            </a>
          </div>
        </div>

        <div className="k3-stack" data-intro aria-hidden="true">
          <div className="k3-stack-inner">
            {docs.map((d) => (
              <div className="k3-doc" key={d.type}>
                <span className="k3-doc-type">{d.type}</span>
                <span className="k3-bar" style={{ width: "62%" }} />
                <span className="k3-bar" style={{ width: "86%" }} />
                {d.rows.map(([k, v], i) => (
                  <span className={`k3-row${d.bad === i ? " is-bad" : ""}`} key={k}>
                    {k}
                    <b>{v}</b>
                  </span>
                ))}
                <span className="k3-bar" style={{ width: "74%" }} />
                <span className="k3-bar" style={{ width: "48%" }} />
              </div>
            ))}
            <div className="k3-scan" />
            <div className="k3-badge">
              <i />
              AI-проверка · 3 замечания
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
