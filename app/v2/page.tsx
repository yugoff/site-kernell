import { CopyButton } from "@/components/v2/copy-button";
import { HeroVideo } from "@/components/v2/hero-video";
import { ScrollDots } from "@/components/v2/scroll-dots";
import { Workflow } from "@/components/v2/workflow";
import { EMAIL, MAIL_DISCUSS, MAIL_HYPOTHESIS, TELEGRAM_HANDLE, TELEGRAM_URL } from "@/lib/contact";
import { cases, industries, pad, stats, why } from "@/lib/site-content";

// Сырые src у <video> не получают basePath автоматически, поэтому добавляем его сами.
const asset = (path: string) => `${process.env.BASE_PATH || ""}${path}`;

const nav = [
  { name: "как работаем", href: "#how" },
  { name: "кейсы", href: "#cases" },
  { name: "почему мы", href: "#why" },
  { name: "контакты", href: "#contact" },
];

function Arrow() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

/** Две тёмные плашки с контактами: ссылка + кнопка «скопировать». */
function Contacts() {
  return (
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
  );
}

export default function V2Page() {
  return (
    <>
      <a className="skip-link" href="#main">
        к содержимому
      </a>

      <header className="hero">
        <div className="topbar">
          <a className="mark" href="#">
            kernell<sup>TM</sup>
          </a>
          <nav aria-label="Разделы">
            {nav.map((link) => (
              <a key={link.href} href={link.href}>
                {link.name}
              </a>
            ))}
          </nav>
        </div>

        <div className="hero-main">
          <div className="hero-body">
            <h1 className="hero-headline">
              ИИ, который
              <br />
              <span className="emph">окупается.</span>
            </h1>
            <p className="hero-sub">
              Находим, где ИИ действительно полезен бизнесу, и превращаем идею в <strong>работающий продукт</strong>.
            </p>
            <p className="industries">
              <span className="industries-label">проекты в отраслях:</span>
              {industries.map((name) => (
                <span key={name} className="industry">
                  {name}
                </span>
              ))}
            </p>
          </div>
          <HeroVideo src={asset("/v2/brag.mp4")} poster={asset("/v2/brag.jpg")} />
        </div>

        <div className="hero-foot">
          <Contacts />
          <aside className="offer" aria-labelledby="offer-title">
            <h2 className="offer-title" id="offer-title">
              Начнём <span className="emph">с PoC.</span>
            </h2>
            <p className="offer-copy">
              Быстрый прототип на ваших реальных данных покажет, работает ли идея, ещё до вложений в полноценную
              разработку.
            </p>
            <a className="go" href={MAIL_HYPOTHESIS}>
              <span>проверить гипотезу</span>
              <Arrow />
            </a>
          </aside>
        </div>
      </header>

      <main id="main">
        <section className="paper" id="how" aria-labelledby="how-title">
          <Workflow>
            <h2 className="paper-title" id="how-title">
              <span className="paper-name">
                как работаем<span className="paper-tag">3 шага</span>
              </span>
              <span className="paper-tagline">
                От задачи
                <br />
                <span className="emph">до результата.</span>
              </span>
            </h2>
            <p className="ask">
              <span className="ask-lead">Начать можно с одной фразы:</span>
              <span className="ask-prompt">
                <span className="prompt" aria-hidden="true">
                  &gt;
                </span>
                хотим понять, где нам нужен ИИ.
                <span className="caret" aria-hidden="true" />
              </span>
            </p>
          </Workflow>
        </section>

        <section className="dark" id="cases" aria-labelledby="cases-title">
          <div className="dark-head">
            <p className="eyebrow">кейсы</p>
            <h2 className="dark-title" id="cases-title">
              Что мы уже <em>сделали.</em>
            </h2>
          </div>

          <div className="set">
            {/* На телефоне — горизонтальная лента, листается пальцем; фокус нужен, чтобы листать с клавиатуры */}
            <div className="cards" id="cases-list" role="region" aria-label="Кейсы" tabIndex={0}>
              {cases.map((item, i) => (
                <article key={item.title} className="card">
                  <div className="card-media">
                    <span className="card-label">{item.tag}</span>
                    {item.metric ? (
                      <p className="card-outcome has-metric">
                        <span className="card-metric">{item.metric}</span>
                        {item.outcome}
                      </p>
                    ) : (
                      <p className="card-outcome">{item.outcome}</p>
                    )}
                  </div>
                  <div className="card-cap">
                    <span className="num">{pad(i + 1)}</span>
                    <h3 className="card-name">{item.title}</h3>
                  </div>
                  <p className="card-desc">{item.text}</p>
                  <p className="card-stack">{item.stack}</p>
                </article>
              ))}
              <article className="card is-cta">
                <a className="card-media" href="#contact" aria-label="Обсудить вашу задачу">
                  <span className="cta-word">
                    ваша задача
                    <br />
                    здесь
                  </span>
                </a>
                <div className="card-cap">
                  <span className="num">{pad(cases.length + 1)}</span>
                  <h3 className="card-name">Ваш проект</h3>
                  <span className="cap-cat">обсудить</span>
                </div>
              </article>
            </div>
            <ScrollDots targetId="cases-list" count={cases.length + 1} />
          </div>

          <div className="set" id="why" aria-labelledby="why-title">
            <div className="set-head">
              <h2 className="set-name" id="why-title">
                <span className="set-cmd">почему мы</span>
              </h2>
            </div>
            <dl className="stats">
              {stats.map((item) => (
                <div key={item.label}>
                  <dt>{item.value}</dt>
                  <dd>{item.label}</dd>
                </div>
              ))}
            </dl>
            <div className="why">
              {why.map((item, i) => (
                <div key={item.title} className="why-item">
                  <span className="num">{pad(i + 1)}</span>
                  <h3 className="why-title">{item.title}</h3>
                  <p className="why-text">{item.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="outro" id="contact" aria-labelledby="contact-title">
          <div className="outro-inner">
            <h2 className="outro-headline" id="contact-title">
              Давайте
              <br />
              <span className="emph">обсудим.</span>
            </h2>
            <div className="outro-grid">
              <p className="outro-meta">
                Опишите задачу — предложим варианты решения и оценку сроков в течение 1–2 рабочих дней.
              </p>
              <div className="outro-actions">
                <a className="go" href={MAIL_DISCUSS}>
                  <span>обсудить задачу</span>
                  <Arrow />
                </a>
                <Contacts />
              </div>
            </div>
            <div className="colophon">
              <span>© {new Date().getFullYear()} Kernell. Все права защищены.</span>
              <span>Москва — Екатеринбург · работаем удалённо по всей России</span>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
