"use client";

import { useRef } from "react";
import { gsap, ScrollTrigger, useGSAP, MQ, safeHandler } from "./gsap";
import { MAIL_DISCUSS } from "@/lib/contact";

const nav = [
  { name: "в деле", href: "#demo" },
  { name: "как работаем", href: "#how" },
  { name: "кейсы", href: "#cases" },
  { name: "почему мы", href: "#why" },
];

/** Шапка (прячется при прокрутке вниз), полоса прогресса и кружок-курсор на десктопе. */
export function Chrome() {
  const root = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const header = root.current!.querySelector<HTMLElement>(".k3-header")!;
      const progress = root.current!.querySelector<HTMLElement>(".k3-progress")!;
      const cursor = root.current!.querySelector<HTMLElement>(".k3-cursor")!;
      const label = cursor.querySelector("span")!;

      // Прогресс прокрутки всей страницы
      gsap.to(progress, {
        scaleX: 1,
        ease: "none",
        scrollTrigger: { start: 0, end: "max", scrub: 0.3 },
      });

      const mm = gsap.matchMedia();

      mm.add(MQ.motion, () => {
        // Шапка уезжает вверх при прокрутке вниз и возвращается при прокрутке вверх
        const show = gsap.from(header, { yPercent: -100, duration: 0.3, ease: "power2.out", paused: true }).progress(1);
        ScrollTrigger.create({
          start: 0,
          end: "max",
          onUpdate: (self) => {
            if (self.direction === 1 && self.scroll() > 160) show.reverse();
            else if (self.direction === -1) show.play();
          },
        });
      });

      mm.add(MQ.finePointer, (_ctx, contextSafe) => {
        gsap.set(cursor, { display: "grid", autoAlpha: 0 });
        const xTo = gsap.quickTo(cursor, "x", { duration: 0.35, ease: "power3" });
        const yTo = gsap.quickTo(cursor, "y", { duration: 0.35, ease: "power3" });

        const onMove = safeHandler(contextSafe, (e: PointerEvent) => {
          gsap.to(cursor, { autoAlpha: 1, duration: 0.2, overwrite: "auto" });
          xTo(e.clientX);
          yTo(e.clientY);
        });
        const onOver = safeHandler(contextSafe, (e: PointerEvent) => {
          const target = (e.target as HTMLElement).closest<HTMLElement>("a, button, [data-cursor]");
          const text = target?.dataset.cursor ?? "";
          label.textContent = text;
          gsap.to(cursor, { scale: target ? (text ? 2.4 : 1.6) : 1, duration: 0.3, ease: "power3.out", overwrite: "auto" });
          gsap.to(label, { autoAlpha: text ? 1 : 0, duration: 0.2, overwrite: "auto" });
        });
        const onLeave = safeHandler(contextSafe, () => gsap.to(cursor, { autoAlpha: 0, duration: 0.2 }));

        window.addEventListener("pointermove", onMove);
        document.addEventListener("pointerover", onOver);
        document.documentElement.addEventListener("pointerleave", onLeave);
        return () => {
          window.removeEventListener("pointermove", onMove);
          document.removeEventListener("pointerover", onOver);
          document.documentElement.removeEventListener("pointerleave", onLeave);
        };
      });

      // Шрифты могут догрузиться после расчёта позиций — пересчитываем триггеры
      document.fonts?.ready.then(() => ScrollTrigger.refresh());
    },
    { scope: root },
  );

  return (
    <div ref={root}>
      <div className="k3-progress" aria-hidden="true" />
      <header className="k3-header">
        <div className="wrap">
          <a className="k3-logo" href="#top">
            kernell<sup>TM</sup>
          </a>
          <nav className="k3-nav" aria-label="Разделы">
            {nav.map((l) => (
              <a key={l.href} href={l.href}>
                {l.name}
              </a>
            ))}
          </nav>
          <a className="k3-header-cta" href={MAIL_DISCUSS}>
            обсудить задачу
          </a>
        </div>
      </header>
      <div className="k3-cursor" aria-hidden="true">
        <span />
      </div>
    </div>
  );
}
