"use client";

import { useRef } from "react";
import { gsap, ScrollTrigger, useGSAP, MQ, countUp } from "./gsap";
import { ScrollDots } from "@/components/v2/scroll-dots";
import { cases, pad } from "@/lib/site-content";

/**
 * Кейсы. Десктоп: секция закрепляется, вертикальная прокрутка двигает ленту карточек вбок,
 * цифры досчитываются, когда карточка выезжает. Телефон: лента листается пальцем.
 * Без анимации: обычная сетка.
 */
export function Cases() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      mm.add(MQ.desktop, () => {
        const el = root.current!;
        const track = el.querySelector<HTMLElement>(".k3-track")!;
        const bar = el.querySelector<HTMLElement>(".k3-cases-bar i")!;
        el.classList.add("is-track");

        // Насколько уехать влево: вся лента минус ширина окна; справа оставляем такое же поле, как слева.
        // Поле меряем по неподвижной обёртке, а не по ленте — лента сама смещается.
        const wrap = el.querySelector<HTMLElement>(".wrap")!;
        const gutter = () => wrap.getBoundingClientRect().left + parseFloat(getComputedStyle(wrap).paddingLeft);
        const distance = () => Math.max(0, track.scrollWidth - window.innerWidth + gutter() * 2);

        gsap.to(track, {
          x: () => -distance(),
          ease: "none", // для горизонтальной ленты только линейно — иначе прокрутка и сдвиг разойдутся
          scrollTrigger: {
            trigger: el,
            pin: el.querySelector(".k3-cases-pin"),
            start: "top top",
            end: () => `+=${distance()}`,
            scrub: 0.8,
            invalidateOnRefresh: true,
            onUpdate: (self) => gsap.set(bar, { scaleX: self.progress }),
          },
        });

        gsap.from(gsap.utils.toArray(".k3-card", el), {
          y: 60,
          autoAlpha: 0,
          duration: 0.8,
          stagger: 0.08,
          ease: "power3.out",
          scrollTrigger: { trigger: el, start: "top 70%" },
        });

        return () => el.classList.remove("is-track");
      });

      // Цифры в карточках досчитываются, когда карточка появляется на экране
      mm.add(MQ.motion, () => {
        gsap.utils.toArray<HTMLElement>(".k3-card-metric", root.current!).forEach((metric) => {
          ScrollTrigger.create({ trigger: metric, start: "top 85%", once: true, onEnter: () => countUp(metric) });
        });
      });
    },
    { scope: root },
  );

  return (
    <section className="k3-cases k3-dark" id="cases" ref={root} aria-labelledby="cases-title">
      <div className="k3-cases-pin k3-section">
        <div className="wrap">
          <div className="k3-cases-head">
            <div>
              <p className="k3-label">кейсы</p>
              <h2 className="k3-h2" id="cases-title">
                Что мы уже <em>сделали.</em>
              </h2>
            </div>
            <span className="k3-cases-hint" aria-hidden="true">
              прокручивайте — лента едет вбок →
            </span>
          </div>
          <div className="k3-track" id="k3-cases-list" role="region" aria-label="Кейсы" tabIndex={0}>
            {cases.map((item, i) => (
              <article className="k3-card" key={item.title}>
                <div className="k3-card-media">
                  <span className="k3-card-tag">{item.tag}</span>
                  {item.metric ? (
                    <p className="k3-card-outcome has-metric">
                      <span className="k3-card-metric">{item.metric}</span>
                      {item.outcome}
                    </p>
                  ) : (
                    <p className="k3-card-outcome">{item.outcome}</p>
                  )}
                </div>
                <div className="k3-card-cap">
                  <span className="k3-num">{pad(i + 1)}</span>
                  <h3 className="k3-card-name">{item.title}</h3>
                </div>
                <p className="k3-card-desc">{item.text}</p>
                <p className="k3-card-stack">{item.stack}</p>
              </article>
            ))}
            <article className="k3-card is-cta">
              <a className="k3-card-media" href="#contact" data-cursor="обсудить">
                <span className="k3-cta-word">
                  ваша задача
                  <br />
                  здесь
                </span>
              </a>
              <div className="k3-card-cap">
                <span className="k3-num">{pad(cases.length + 1)}</span>
                <h3 className="k3-card-name">Ваш проект</h3>
                <span className="k3-card-cat">обсудить</span>
              </div>
            </article>
          </div>
          <div className="k3-cases-bar" aria-hidden="true">
            <i />
          </div>
          <ScrollDots targetId="k3-cases-list" count={cases.length + 1} />
        </div>
      </div>
    </section>
  );
}
