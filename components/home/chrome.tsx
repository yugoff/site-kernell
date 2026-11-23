"use client";

import { useRef } from "react";
import { gsap, ScrollTrigger, useGSAP, MQ } from "./gsap";
import { MAIL_DISCUSS } from "@/lib/contact";

const nav = [
  { name: "в деле", href: "#demo" },
  { name: "ассистент", href: "#assistant" },
  { name: "как работаем", href: "#how" },
  { name: "кейсы", href: "#cases" },
  { name: "почему мы", href: "#why" },
];

/** Шапка (прячется при прокрутке вниз) и полоса прогресса прокрутки. */
export function Chrome() {
  const root = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const header = root.current!.querySelector<HTMLElement>(".k3-header")!;
      const progress = root.current!.querySelector<HTMLElement>(".k3-progress")!;

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
    </div>
  );
}
