"use client";

import { useRef } from "react";
import { gsap, SplitText, useGSAP, MQ, safeHandler } from "./gsap";
import { CopyButton } from "@/components/v2/copy-button";
import { EMAIL, MAIL_DISCUSS, TELEGRAM_HANDLE, TELEGRAM_URL } from "@/lib/contact";

/** Финал: заголовок появляется по буквам, кнопка «магнитом» тянется к курсору. */
export function Outro() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      mm.add(MQ.motion, () => {
        const el = root.current!;
        const split = SplitText.create(el.querySelector(".k3-outro-title"), { type: "lines,chars", mask: "lines" });
        gsap
          .timeline({ scrollTrigger: { trigger: el, start: "top 65%" } })
          .from(split.chars, { yPercent: 120, duration: 0.8, stagger: 0.025, ease: "power4.out" })
          .from(el.querySelectorAll(".k3-outro-meta, .k3-magnet, .k3-outro .cmd-stack"), { autoAlpha: 0, y: 30, duration: 0.7, stagger: 0.1, ease: "power3.out" }, 0.4);
        return () => split.revert();
      });

      // Кнопка смещается к курсору, пока он рядом, и пружинит обратно
      mm.add(MQ.finePointer, (_ctx, contextSafe) => {
        const zone = root.current!.querySelector<HTMLElement>(".k3-magnet-zone")!;
        const btn = zone.querySelector<HTMLElement>(".k3-magnet")!;
        const xTo = gsap.quickTo(btn, "x", { duration: 0.6, ease: "power3" });
        const yTo = gsap.quickTo(btn, "y", { duration: 0.6, ease: "power3" });
        const onMove = safeHandler(contextSafe, (e: PointerEvent) => {
          const r = zone.getBoundingClientRect();
          xTo((e.clientX - (r.left + r.width / 2)) * 0.35);
          yTo((e.clientY - (r.top + r.height / 2)) * 0.35);
        });
        const onLeave = safeHandler(contextSafe, () => gsap.to(btn, { x: 0, y: 0, duration: 0.9, ease: "elastic.out(1, 0.4)" }));
        zone.addEventListener("pointermove", onMove);
        zone.addEventListener("pointerleave", onLeave);
        return () => {
          zone.removeEventListener("pointermove", onMove);
          zone.removeEventListener("pointerleave", onLeave);
        };
      });
    },
    { scope: root },
  );

  return (
    <section className="k3-outro k3-section" id="contact" ref={root} aria-labelledby="contact-title">
      <div className="wrap">
        <p className="k3-label">контакты</p>
        <h2 className="k3-outro-title" id="contact-title">
          Давайте
          <br />
          обсудим.
        </h2>
        <div className="k3-outro-grid">
          <p className="k3-outro-meta">
            Опишите задачу — предложим варианты решения и оценку сроков в течение 1–2 рабочих дней.
          </p>
          <div className="k3-magnet-zone">
            <a className="k3-magnet" href={MAIL_DISCUSS}>
              обсудить{" "}
              <br />
              задачу
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </a>
          </div>
          <div className="cmd-stack">
            <span className="cmd-label">telegram</span>
            <pre className="cmd">
              <code>
                <span className="prompt">$</span> написать{" "}
                <a href={TELEGRAM_URL} target="_blank" rel="noopener noreferrer">
                  {TELEGRAM_HANDLE}
                </a>
              </code>
              <CopyButton text={TELEGRAM_HANDLE} label="Скопировать Telegram" />
            </pre>
            <span className="cmd-label">почта</span>
            <pre className="cmd">
              <code>
                <span className="prompt">$</span> написать <a href={`mailto:${EMAIL}`}>{EMAIL}</a>
              </code>
              <CopyButton text={EMAIL} label="Скопировать почту" />
            </pre>
          </div>
        </div>
        <div className="k3-colophon">
          <span>© {new Date().getFullYear()} Kernell. Все права защищены.</span>
          <span>Москва — Екатеринбург · работаем удалённо по всей России</span>
        </div>
      </div>
    </section>
  );
}
