"use client";

import { useRef } from "react";
import { gsap, ScrollTrigger, useGSAP, MQ, countUp } from "./gsap";
import { pad, stats, why } from "@/lib/site-content";

/** «Почему мы»: цифры досчитываются, пункты появляются пачкой. */
export function Proof() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(MQ.motion, () => {
        const el = root.current!;
        ScrollTrigger.create({
          trigger: el.querySelector(".k3-stats"),
          start: "top 80%",
          once: true,
          onEnter: () => gsap.utils.toArray<HTMLElement>(".k3-stats dt", el).forEach((dt, i) => countUp(dt, 1.2 + i * 0.2)),
        });
        const items = gsap.utils.toArray<HTMLElement>(".k3-why-item", el);
        gsap.set(items, { autoAlpha: 0, y: 40 });
        ScrollTrigger.batch(items, {
          start: "top 85%",
          once: true,
          onEnter: (batch) => gsap.to(batch, { autoAlpha: 1, y: 0, duration: 0.7, stagger: 0.12, ease: "power3.out" }),
        });
      });
    },
    { scope: root },
  );

  return (
    <section className="k3-section" id="why" ref={root} aria-labelledby="why-title">
      <div className="wrap">
        <p className="k3-label">почему мы</p>
        <h2 className="k3-h2" id="why-title">
          Опыт, который <em>можно проверить.</em>
        </h2>
        <dl className="k3-stats">
          {stats.map((s) => (
            <div key={s.label}>
              <dt>{s.value}</dt>
              <dd>{s.label}</dd>
            </div>
          ))}
        </dl>
        <div className="k3-why">
          {why.map((w, i) => (
            <div className="k3-why-item" key={w.title}>
              <span className="k3-num">{pad(i + 1)}</span>
              <h3 className="k3-why-title">{w.title}</h3>
              <p className="k3-why-text">{w.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
