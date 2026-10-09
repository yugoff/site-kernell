"use client";

import { useEffect, useState } from "react";
import { steps } from "@/lib/site-content";

const STEP_MS = 5000;

/** Подсветка строк в кавычках и комментариев — без зависимостей. */
function CodeLine({ line }: { line: string }) {
  if (line.trim().startsWith("//")) return <span className="cmt">{line}</span>;
  return (
    <>
      {line.split(/('[^']*')/).map((part, i) =>
        part.startsWith("'") ? (
          <span key={i} className="str">
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </>
  );
}

/** Шаги работы слева и «экран» с кодом справа; шаги листаются сами, клик выбирает шаг. */
export function Workflow({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState(0);
  const [auto, setAuto] = useState(true);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) setAuto(false);
  }, []);

  // Перезапускается при смене шага, чтобы полоска прогресса и таймер не расходились.
  useEffect(() => {
    if (!auto) return;
    const id = setTimeout(() => setActive((i) => (i + 1) % steps.length), STEP_MS);
    return () => clearTimeout(id);
  }, [active, auto]);

  return (
    <div className="paper-inner">
      <div className="paper-copy">
        {children}
        <ol className="steps" style={{ "--step-ms": `${STEP_MS}ms` } as React.CSSProperties}>
          {steps.map((step, i) => (
            <li key={step.number} className="step">
              <button
                type="button"
                className="step-btn"
                aria-pressed={active === i}
                onClick={() => {
                  // Выбрал шаг сам — больше не листаем, чтобы не мешать читать.
                  setActive(i);
                  setAuto(false);
                }}
              >
                <span className="step-num">{step.number}</span>
                <span className="step-title">{step.title}</span>
                <span className="step-text">{step.text}</span>
                {active === i && auto && (
                  <span className="step-bar" aria-hidden="true">
                    <span />
                  </span>
                )}
              </button>
            </li>
          ))}
        </ol>
        <p className="note">
          Не знаете, с чего начать? Начните с <code>AI-аудита</code>: разберём процессы и данные и найдём, где ИИ даст
          наибольший эффект.
        </p>
      </div>

      <figure className="paper-media">
        <div className="screen">
          <div className="screen-bar">
            <span className="screen-dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <span>workflow.ts</span>
            <span>
              {steps[active].number} / {steps[steps.length - 1].number}
            </span>
          </div>
          <pre className="screen-code" aria-label={`Шаг ${steps[active].number}: ${steps[active].title}`}>
            {steps[active].code.split("\n").map((line, i) => (
              <code key={`${active}-${i}`} className="code-line" style={{ animationDelay: `${90 * i}ms` }}>
                <span className="ln">{i + 1}</span>
                <CodeLine line={line} />
              </code>
            ))}
          </pre>
          <div className="screen-foot">
            <span className="dot" aria-hidden="true" />
            ready
          </div>
        </div>
      </figure>
    </div>
  );
}
