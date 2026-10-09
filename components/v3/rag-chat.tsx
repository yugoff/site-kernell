"use client";

import { useRef, useState } from "react";
import { gsap, SplitText, useGSAP, MQ } from "./gsap";

// Кейс «AI-ассистент техподдержки сети клиник» (RAG, Telegram-бот, 2 000+ страниц документации).
// Вопросы, ответы и документы — условный пример диалога: показывают, как ассистент отвечает
// и ссылается на первоисточник.
type Source = { doc: string; where: string; before: string; hit: string; after: string };
type QA = { q: string; a: string; src?: Source; miss?: string };

const qa: QA[] = [
  {
    q: "Как перенести запись пациента на другое время?",
    a: "Откройте расписание врача, найдите запись и выберите «Перенести». Укажите свободный слот и подтвердите — уведомление пациенту уйдёт автоматически.",
    src: {
      doc: "Руководство регистратора МИС",
      where: "раздел 3.2 · Перенос записи",
      before: "Запись можно перенести, пока приём не начался. Перенос доступен регистратору и администратору.",
      hit: "Откройте расписание врача и в меню записи выберите «Перенести». Выберите свободный слот и подтвердите действие — уведомление пациенту отправляется автоматически.",
      after: "Если свободных слотов нет, используйте лист ожидания (раздел 3.5).",
    },
  },
  {
    q: "Не печатается направление — что делать?",
    a: "Проверьте, что в карточке пациента заполнен полис ОМС: без него печать направления заблокирована. Если полис есть — обновите шаблон печати в «Настройках».",
    src: {
      doc: "Инструкция техподдержки",
      where: "с. 214 · Ошибки печати",
      before: "Ошибки печати чаще всего связаны с незаполненными обязательными полями.",
      hit: "Печать направления блокируется, если в карточке пациента не заполнен полис ОМС. Если полис указан, обновите шаблон печати: «Настройки» → «Шаблоны документов».",
      after: "При повторной ошибке сохраните журнал печати и передайте его в техподдержку.",
    },
  },
  {
    q: "Как дать новому врачу доступ к журналу?",
    a: "Доступ выдаёт администратор: «Пользователи» → карточка врача → вкладка «Роли» → роль «Врач-специалист». Права применятся после повторного входа.",
    src: {
      doc: "Руководство администратора МИС",
      where: "раздел 7.1 · Роли и права",
      before: "Права пользователей задаются через роли. Одному пользователю можно назначить несколько ролей.",
      hit: "Чтобы открыть врачу доступ к журналу, в разделе «Пользователи» откройте его карточку, на вкладке «Роли» добавьте роль «Врач-специалист». Права применяются после повторного входа.",
      after: "Изменения ролей записываются в журнал аудита (раздел 7.4).",
    },
  },
  {
    q: "А если в документации ответа нет?",
    a: "Тогда я так и скажу: в базе знаний ответа нет. И предложу передать вопрос специалисту — я не придумываю ответы, а отвечаю только по документации.",
    miss: "в базе знаний ответа нет → передать специалисту",
  },
];

const GREETING = "Здравствуйте! Я отвечаю на вопросы по работе с МИС — только по внутренней документации. Выберите вопрос ниже.";

type Msg = { id: number; role: "user" | "bot" | "typing"; text?: string; qa?: number };

function DocIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5M9 13h6M9 17h4" />
    </svg>
  );
}

export function RagChat() {
  const root = useRef<HTMLElement>(null);
  const nextId = useRef(1);
  const lastChip = useRef<HTMLButtonElement | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([{ id: 0, role: "bot", text: GREETING }]);
  const [busy, setBusy] = useState(false);
  const [asked, setAsked] = useState<number[]>([]);
  const [src, setSrc] = useState<number | null>(null);

  // Новые сообщения: появляются, ответ ассистента «печатается» по словам, чат прокручивается вниз
  useGSAP(
    () => {
      const el = root.current!;
      const body = el.querySelector<HTMLElement>(".k3-chat-body")!;
      const motion = window.matchMedia(MQ.motion).matches;
      el.querySelectorAll<HTMLElement>(".k3-msg:not([data-shown])").forEach((m) => {
        m.dataset.shown = "1";
        if (!motion) return;
        if (m.classList.contains("is-bot")) {
          gsap.from(m, { autoAlpha: 0, y: 10, duration: 0.3, ease: "power2.out" });
          const split = SplitText.create(m.querySelector(".k3-msg-text"), { type: "words" });
          const typing = gsap.from(split.words, { autoAlpha: 0, duration: 0.2, stagger: 0.03, ease: "none", onComplete: () => split.revert() });
          const extra = m.querySelector(".k3-src-chip, .k3-miss");
          if (extra) gsap.from(extra, { autoAlpha: 0, scale: 0.85, duration: 0.4, ease: "back.out(2)", delay: typing.duration() });
        } else {
          gsap.from(m, { autoAlpha: 0, y: 12, scale: 0.96, transformOrigin: "100% 100%", duration: 0.3, ease: "power2.out" });
        }
      });
      gsap.to(body, { scrollTop: body.scrollHeight, duration: motion ? 0.5 : 0, ease: "power2.out", overwrite: true });
    },
    { scope: root, dependencies: [msgs] },
  );

  // Панель источника выезжает, фрагмент подсвечивается маркером
  useGSAP(
    () => {
      if (src === null) return;
      const panel = root.current!.querySelector<HTMLElement>(".k3-src")!;
      panel.querySelector<HTMLButtonElement>(".k3-src-close")?.focus();
      if (!window.matchMedia(MQ.motion).matches) return;
      gsap.fromTo(panel, { xPercent: 100 }, { xPercent: 0, duration: 0.45, ease: "power3.out" });
      gsap.fromTo(panel.querySelector("mark"), { backgroundSize: "0% 100%" }, { backgroundSize: "100% 100%", duration: 0.8, delay: 0.35, ease: "power2.inOut" });
    },
    { scope: root, dependencies: [src] },
  );

  const ask = (i: number) => {
    if (busy) return;
    setBusy(true);
    setSrc(null);
    setAsked((a) => (a.includes(i) ? a : [...a, i]));
    const typingId = nextId.current++;
    setMsgs((m) => [...m.slice(-6), { id: nextId.current++, role: "user", text: qa[i].q }, { id: typingId, role: "typing" }]);
    const delay = window.matchMedia(MQ.motion).matches ? 1100 : 300;
    window.setTimeout(() => {
      // Ответ — новым сообщением (новый id), чтобы он появился с анимацией
      setMsgs((m) => m.map((x) => (x.id === typingId ? { id: nextId.current++, role: "bot", qa: i } : x)));
      setBusy(false);
    }, delay);
  };

  const closeSrc = () => {
    const panel = root.current?.querySelector<HTMLElement>(".k3-src");
    const done = () => {
      setSrc(null);
      lastChip.current?.focus();
    };
    if (panel && window.matchMedia(MQ.motion).matches) gsap.to(panel, { xPercent: 100, duration: 0.3, ease: "power2.in", onComplete: done });
    else done();
  };

  const source = src !== null ? qa[src].src : undefined;

  return (
    <section className="k3-rag k3-section" id="assistant" ref={root} aria-labelledby="rag-title">
      <div className="wrap k3-rag-grid">
        <div>
          <p className="k3-label">кейс · медицина · RAG · Telegram-бот</p>
          <h2 className="k3-h2" id="rag-title">
            Отвечает по документации. <em>И показывает, где это написано.</em>
          </h2>
          <p className="k3-rag-lead">
            AI-ассистент техподдержки сети клиник отвечает сотрудникам по работе с медицинской информационной системой —
            только по внутренней документации. Каждый ответ можно проверить по первоисточнику.
          </p>
          <ul className="k3-rag-facts">
            <li>
              <b>2 000+</b> страниц документации в базе
            </li>
            <li>
              <b>только</b> по базе знаний, без выдумок
            </li>
            <li>
              <b>ссылка</b> на первоисточник в каждом ответе
            </li>
          </ul>
        </div>

        <div className="k3-chat-wrap">
          <div className="k3-chat">
            <div className="k3-chat-head">
              <span className="k3-chat-avatar" aria-hidden="true">
                K
              </span>
              <span>
                <b>Ассистент техподдержки</b>
                <small>онлайн · пример диалога</small>
              </span>
            </div>

            <div className="k3-chat-body" role="log" aria-live="polite" aria-label="Диалог с ассистентом">
              {msgs.map((m) => {
                if (m.role === "typing")
                  return (
                    <div key={m.id} className="k3-msg is-typing" aria-label="Ассистент печатает">
                      <i />
                      <i />
                      <i />
                    </div>
                  );
                if (m.role === "user")
                  return (
                    <div key={m.id} className="k3-msg is-user">
                      {m.text}
                    </div>
                  );
                const item = m.qa !== undefined ? qa[m.qa] : undefined;
                return (
                  <div key={m.id} className="k3-msg is-bot" data-shown={m.id === 0 ? "1" : undefined}>
                    <span className="k3-msg-text">{item ? item.a : m.text}</span>
                    {item?.src && (
                      <button
                        type="button"
                        className="k3-src-chip"
                        onClick={(e) => {
                          lastChip.current = e.currentTarget;
                          setSrc(m.qa!);
                        }}
                      >
                        <DocIcon />
                        {item.src.doc} · {item.src.where}
                      </button>
                    )}
                    {item?.miss && <span className="k3-miss">{item.miss}</span>}
                  </div>
                );
              })}
            </div>

            {source && (
              <aside
                className="k3-src"
                aria-label="Источник ответа"
                onKeyDown={(e) => {
                  if (e.key === "Escape") closeSrc();
                }}
              >
                <div className="k3-src-head">
                  <span>источник ответа</span>
                  <button type="button" className="k3-src-close" onClick={closeSrc} aria-label="Закрыть источник">
                    ×
                  </button>
                </div>
                <p className="k3-src-doc">{source.doc}</p>
                <p className="k3-src-where">{source.where}</p>
                <p className="k3-src-p">{source.before}</p>
                <p className="k3-src-p">
                  <mark>{source.hit}</mark>
                </p>
                <p className="k3-src-p">{source.after}</p>
              </aside>
            )}
          </div>

          <div className="k3-chat-questions" role="group" aria-label="Вопросы ассистенту">
            {qa.map((item, i) => (
              <button
                key={item.q}
                type="button"
                className={`k3-q${asked.includes(i) ? " is-asked" : ""}`}
                onClick={() => ask(i)}
                aria-disabled={busy}
              >
                {item.q}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
