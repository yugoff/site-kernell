"use client";

import { useEffect, useState } from "react";

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Счётчик и точки под горизонтальной лентой карточек. Лента листается только на телефоне
 * (см. .cards в v2.css), поэтому и индикатор виден только там.
 */
export function ScrollDots({ targetId, count }: { targetId: string; count: number }) {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const el = document.getElementById(targetId);
    if (!el) return;
    const onScroll = () => {
      const first = el.firstElementChild as HTMLElement | null;
      if (!first) return;
      const step = first.offsetWidth + parseFloat(getComputedStyle(el).columnGap || "0");
      // В конце ленты последняя карточка не доезжает до левого края — считаем её активной.
      const atEnd = el.scrollLeft >= el.scrollWidth - el.clientWidth - 2;
      setActive(atEnd ? count - 1 : Math.min(count - 1, Math.round(el.scrollLeft / step)));
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [targetId, count]);

  return (
    <div className="scroll-dots" aria-hidden="true">
      <span className="scroll-count">
        {pad(active + 1)} / {pad(count)}
      </span>
      <span className="scroll-track">
        {Array.from({ length: count }, (_, i) => (
          <i key={i} className={i === active ? "is-active" : undefined} />
        ))}
      </span>
      {active < count - 1 && <span className="scroll-hint">листайте →</span>}
    </div>
  );
}
