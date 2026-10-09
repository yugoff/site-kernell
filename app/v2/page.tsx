import { AiVisual, CollabVisual, DeployVisual } from "@/components/feature-visuals";
import { CopyButton } from "@/components/v2/copy-button";
import { HeroVideo } from "@/components/v2/hero-video";
import { HueParam } from "@/components/v2/hue-param";
import { Workflow } from "@/components/v2/workflow";
import { EMAIL, MAIL_DISCUSS, MAIL_HYPOTHESIS, TELEGRAM_HANDLE, TELEGRAM_URL } from "@/lib/contact";

// Сырые src у <video> не получают basePath автоматически, поэтому добавляем его сами.
const asset = (path: string) => `${process.env.BASE_PATH || ""}${path}`;

const nav = [
  { name: "что делаем", href: "#what" },
  { name: "как работаем", href: "#how" },
  { name: "решения", href: "#cases" },
  { name: "вопросы", href: "#faq" },
  { name: "контакты", href: "#contact" },
];

const services = [
  {
    title: "Разрабатываем AI-продукты",
    category: "разработка",
    text: "AI-ассистенты · AI-агенты · работа с документами · корпоративные знания и RAG · AI-прогнозирование · ML · Computer Vision.",
    Visual: DeployVisual,
  },
  {
    title: "Проверяем гипотезы",
    category: "PoC",
    text: "Проводим быстрый PoC на реальных данных, чтобы определить эффективность идеи до полноценной разработки.",
    Visual: AiVisual,
  },
  {
    title: "Проводим AI-аудит",
    category: "аудит",
    text: "Разбираем бизнес-процессы и определяем, где внедрение ИИ может дать наибольший эффект.",
    Visual: CollabVisual,
  },
];

const cases = [
  {
    title: "AI-ассистент для работы с корпоративными документами",
    category: "RAG",
    text: "Поиск по внутренней базе знаний и ответы со ссылками на источники.",
    outcome: "Быстрый доступ к знаниям компании",
  },
  {
    title: "AI-прогнозирование для поддержки управленческих решений",
    category: "ML",
    text: "Модели спроса, нагрузки и рисков на данных вашего бизнеса.",
    outcome: "Решения на основе данных, а не интуиции",
  },
  {
    title: "Автоматизация сложного интеллектуального процесса",
    category: "агенты",
    text: "Агенты, которые берут на себя рутину: разбор заявок, документов, обращений.",
    outcome: "Освобождаем время команды для важного",
  },
  {
    title: "Computer Vision для контроля и анализа изображений",
    category: "CV",
    text: "Распознавание объектов, дефектов и текста на фото и видео.",
    outcome: "Контроль качества без ручной рутины",
  },
];

const why = [
  {
    title: "Экспертиза",
    text: "Вся техническая команда — выпускники или студенты ведущих технических вузов России. Активно участвуем в AI-хакатонах и занимаем призовые места.",
  },
  { title: "Результат", text: "Связываем разработку с конкретной бизнес-задачей и измеримым эффектом." },
  {
    title: "Сотрудничество",
    text: "Строим долгосрочные отношения с клиентами и создаём основу для дальнейшего развития и роста бизнеса.",
  },
  {
    title: "С кем работаем",
    text: "С компаниями, где есть сложные интеллектуальные процессы, большие объёмы данных и понятный экономический эффект.",
  },
];

const stack = ["Python", "PyTorch", "LLM", "RAG", "AI-агенты", "Computer Vision", "NLP", "MLOps"];

const faq = [
  {
    q: "С чего начать, если мы не знаем, где нам нужен ИИ?",
    a: "С AI-аудита: разбираем ваши процессы и данные, находим места, где ИИ даст максимальный эффект, и оцениваем реалистичность каждой идеи.",
  },
  {
    q: "Что такое PoC и зачем он нужен?",
    a: "Это быстрый прототип на ваших реальных данных. Он показывает, работает ли идея, ещё до вложений в полноценную разработку.",
  },
  {
    q: "Какие задачи вы решаете?",
    a: "AI-ассистенты и агенты, работа с документами и корпоративными знаниями (RAG), прогнозирование и ML, Computer Vision.",
  },
  {
    q: "Как мы будем работать вместе?",
    a: "Сначала обсуждаем задачу и KPI, затем проверяем гипотезу на PoC, после чего создаём и развиваем продукт. На каждом этапе вы видите результат.",
  },
];

const pad = (n: number) => String(n).padStart(2, "0");

function Arrow({ down = false }: { down?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={down ? "M12 5v14M5 12l7 7 7-7" : "M5 12h14M13 6l6 6-6 6"} />
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
          <span className="prompt">$</span> mail <a href={`mailto:${EMAIL}`}>{EMAIL}</a>
        </code>
        <CopyButton text={EMAIL} label="Скопировать почту" />
      </pre>
    </div>
  );
}

export default function V2Page() {
  return (
    <>
      <HueParam />
      <a className="skip-link" href="#main">
        к содержимому
      </a>

      <header className="hero">
        <div className="topbar">
          <a className="mark" href="#">
            kernell<sup>TM</sup>
          </a>
          <a className="pill" href="#how">
            <span className="pill-tag">старт</span>
            <span className="pill-text">
              AI-аудит<span className="pill-sep"> · </span>
              <span className="pill-tagline">найдём, где ИИ даст эффект</span>
            </span>
            <span className="pill-arrow">
              <Arrow down />
            </span>
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
              Находим, где ИИ действительно полезен бизнесу, и превращаем идею в <strong>работающий продукт</strong>. С
              фокусом на измеримый экономический эффект.
            </p>
          </div>
          <HeroVideo src={asset("/v2/brag.mp4")} poster={asset("/v2/brag.jpg")} />
        </div>

        <div className="hero-foot">
          <Contacts />
          <aside className="offer" aria-labelledby="offer-title">
            <h2 className="offer-title" id="offer-title">
              начнём <span className="emph">с PoC.</span>
            </h2>
            <p className="offer-copy">
              Быстрый прототип на ваших реальных данных покажет, работает ли идея, ещё до вложений в полноценную
              разработку.
            </p>
            <a className="go" href={MAIL_HYPOTHESIS}>
              <span>проверить гипотезу</span>
              <Arrow />
            </a>
            <ul className="facts">
              <li>реальные данные</li>
              <li>до разработки</li>
              <li>метрика эффекта</li>
            </ul>
          </aside>
          <div className="hero-meta">
            <span className="dot" aria-hidden="true" />
            готовы обсудить задачу · AI и ML для бизнеса
          </div>
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
                от задачи
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

        <section className="dark" id="what" aria-labelledby="what-title">
          <div className="dark-head">
            <div>
              <p className="eyebrow">что делаем · от гипотезы до продукта</p>
              <h2 className="dark-title" id="what-title">
                AI-решения под задачи <em>бизнеса.</em>
              </h2>
            </div>
            <p className="dark-note">
              Разрабатываем и интегрируем AI и ML-решения под конкретные задачи — с фокусом на измеримый эффект.
            </p>
          </div>

          <div className="set" aria-labelledby="set-services">
            <div className="set-head">
              <h3 className="set-name" id="set-services">
                <span className="set-cmd">услуги</span>
                <span className="set-tag">три направления</span>
              </h3>
              <p className="set-note">От аудита и проверки гипотез до создания рабочих решений.</p>
            </div>
            <div className="cards">
              {services.map(({ title, category, text, Visual }, i) => (
                <article key={title} className="card">
                  <div className="card-media">
                    <span className="card-label">{category}</span>
                    <div className="card-visual" aria-hidden="true">
                      <div>
                        <Visual />
                      </div>
                    </div>
                  </div>
                  <div className="card-cap">
                    <span className="num">{pad(i + 1)}</span>
                    <h4 className="card-name">{title}</h4>
                  </div>
                  <p className="card-desc">{text}</p>
                </article>
              ))}
              <article className="card is-cta">
                <a className="card-media" href="#contact" aria-label="Обсудить вашу задачу">
                  <span className="cta-word">
                    ваша
                    <br />
                    задача
                    <br />
                    здесь
                  </span>
                </a>
                <div className="card-cap">
                  <span className="num">{pad(services.length + 1)}</span>
                  <h4 className="card-name">Ваш проект</h4>
                  <span className="cap-cat">обсудить</span>
                </div>
                <p className="card-desc">Расскажите о задаче — предложим следующий шаг.</p>
              </article>
            </div>
          </div>

          <div className="set" id="cases" aria-labelledby="set-cases">
            <div className="set-head">
              <h3 className="set-name" id="set-cases">
                <span className="set-cmd">решения</span>
                <span className="set-tag">что даёт бизнесу</span>
              </h3>
              <p className="set-note">Типовые задачи, с которыми к нам приходят.</p>
            </div>
            <div className="cards cards-4">
              {cases.map((item, i) => (
                <article key={item.title} className="card">
                  <div className="card-media">
                    <span className="card-label">{item.category}</span>
                    <p className="card-outcome">{item.outcome}</p>
                  </div>
                  <div className="card-cap">
                    <span className="num">{pad(i + 1)}</span>
                    <h4 className="card-name">{item.title}</h4>
                  </div>
                  <p className="card-desc">{item.text}</p>
                </article>
              ))}
            </div>
          </div>

          <div className="set" aria-labelledby="set-why">
            <div className="set-head">
              <h3 className="set-name" id="set-why">
                <span className="set-cmd">почему мы</span>
                <span className="set-tag">в чём мы хороши</span>
              </h3>
            </div>
            <div className="why">
              {why.map((item, i) => (
                <div key={item.title} className="why-item">
                  <span className="num">{pad(i + 1)}</span>
                  <h4 className="why-title">{item.title}</h4>
                  <p className="why-text">{item.text}</p>
                </div>
              ))}
            </div>
            <div className="stack">
              <span className="stack-label">технологии</span>
              <ul>
                {stack.map((name) => (
                  <li key={name}>{name}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section className="paper" id="faq" aria-labelledby="faq-title">
          <div className="paper-inner faq-inner">
            <div className="paper-copy">
              <h2 className="paper-title" id="faq-title">
                <span className="paper-name">
                  вопросы<span className="paper-tag">FAQ</span>
                </span>
                <span className="paper-tagline">
                  частые
                  <br />
                  <span className="emph">вопросы.</span>
                </span>
              </h2>
            </div>
            <div className="faq-list">
              {faq.map((item, i) => (
                <details key={item.q} className="faq-item" open={i === 0}>
                  <summary>
                    <span className="faq-num">{pad(i + 1)}</span>
                    <span className="faq-q">{item.q}</span>
                    <span className="faq-plus" aria-hidden="true">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                        <path d="M12 5v14M5 12h14" />
                      </svg>
                    </span>
                  </summary>
                  <p className="faq-a">{item.a}</p>
                </details>
              ))}
              <details className="faq-item">
                <summary>
                  <span className="faq-num">{pad(faq.length + 1)}</span>
                  <span className="faq-q">Как с вами связаться?</span>
                  <span className="faq-plus" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                  </span>
                </summary>
                <p className="faq-a">
                  Напишите в Telegram{" "}
                  <a href={TELEGRAM_URL} target="_blank" rel="noopener noreferrer">
                    {TELEGRAM_HANDLE}
                  </a>{" "}
                  или на <a href={`mailto:${EMAIL}`}>{EMAIL}</a> — расскажите о задаче, и мы предложим следующий шаг.
                </p>
              </details>
            </div>
          </div>
        </section>

        <section className="outro" id="contact" aria-labelledby="contact-title">
          <div className="outro-inner">
            <h2 className="outro-headline" id="contact-title">
              давайте
              <br />
              <span className="emph">обсудим.</span>
            </h2>
            <div className="outro-grid">
              <div>
                <p className="outro-meta">
                  Расскажите, какую задачу хотите решить. Обсудим, где ИИ может дать вашему бизнесу измеримый эффект, и
                  предложим следующий шаг.
                </p>
                <p className="outro-small">Первая консультация — чтобы определить следующий шаг.</p>
              </div>
              <div className="outro-actions">
                <a className="go" href={MAIL_DISCUSS}>
                  <span>обсудить задачу</span>
                  <Arrow />
                </a>
                <a className="go is-ghost" href={MAIL_HYPOTHESIS}>
                  <span>проверить гипотезу</span>
                  <Arrow />
                </a>
                <Contacts />
              </div>
            </div>
            <div className="colophon">
              <span>© {new Date().getFullYear()} Kernell. Все права защищены.</span>
              <span>AI и ML для задач бизнеса</span>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
