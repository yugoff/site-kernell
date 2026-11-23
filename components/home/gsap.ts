import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import { ScrambleTextPlugin } from "gsap/ScrambleTextPlugin";
import { DrawSVGPlugin } from "gsap/DrawSVGPlugin";
import { useGSAP } from "@gsap/react";

// Регистрируем плагины один раз и только в браузере: на сервере GSAP не запускаем.
if (typeof window !== "undefined") {
  gsap.registerPlugin(useGSAP, ScrollTrigger, SplitText, ScrambleTextPlugin, DrawSVGPlugin);
}

export { gsap, ScrollTrigger, SplitText, useGSAP };

/** Условия для gsap.matchMedia(): крупные эффекты — только на десктопе и без «меньше движения». */
export const MQ = {
  desktop: "(min-width: 900px) and (prefers-reduced-motion: no-preference)",
  mobile: "(max-width: 899px) and (prefers-reduced-motion: no-preference)",
  motion: "(prefers-reduced-motion: no-preference)",
  finePointer: "(pointer: fine) and (prefers-reduced-motion: no-preference)",
};

/** Буквы для эффекта «текст собирается из случайных символов». */
export const RU_CHARS = "абвгдежзиклмнопрстуфхцчшщыэюя";

/** Досчитывает число в элементе до значения из его текста: «−90%», «2 000+», «15+». */
export function countUp(el: HTMLElement, duration = 1.4) {
  const final = el.textContent ?? "";
  // Число может быть с пробелами внутри («2 000»), но пробел после числа относится к подписи («4 года»).
  const match = final.match(/^(\D*)(\d(?:[\d\s ]*\d)?)(.*)$/);
  if (!match) return gsap.timeline();
  const [, prefix, digits, suffix] = match;
  const target = Number(digits.replace(/[\s ]/g, ""));
  const counter = { v: 0 };
  return gsap.to(counter, {
    v: target,
    duration,
    ease: "power2.out",
    onUpdate: () => {
      el.textContent = `${prefix}${Math.round(counter.v).toLocaleString("ru-RU")}${suffix}`;
    },
    onComplete: () => {
      el.textContent = final;
    },
  });
}

/** Обёртка для обработчиков событий внутри matchMedia: contextSafe из GSAP возвращает голый Function. */
export function safeHandler<E extends Event = Event>(
  contextSafe: ((func: Function) => Function) | undefined,
  fn: (e: E) => void,
): (e: E) => void {
  return (contextSafe ? contextSafe(fn) : fn) as (e: E) => void;
}
