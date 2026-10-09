import { CopyButton } from "@/components/v2/copy-button";
import { HeroVideo } from "@/components/v2/hero-video";
import { HueParam } from "@/components/v2/hue-param";
import { Workflow } from "@/components/v2/workflow";
import { EMAIL, MAIL_DISCUSS, MAIL_HYPOTHESIS, TELEGRAM_HANDLE, TELEGRAM_URL } from "@/lib/contact";

// Сырые src у <video> не получают basePath автоматически, поэтому добавляем его сами.
const asset = (path: string) => `${process.env.BASE_PATH || ""}${path}`;

const nav = [
  { name: "как работаем", href: "#how" },
  { name: "кейсы", href: "#cases" },
  { name: "почему мы", href: "#why" },
  { name: "контакты", href: "#contact" },
];

// Кейсы и цифры — из презентации «ML-Uslugi.pdf».
const cases = [
  {
    tag: "логистика · on-prem",
    metric: "−90%",
    outcome: "времени на проверку документов",
    title: "Проверка логистических документов",
    text: "Сверяет инвойсы, ТТН, CMR и упаковочные листы, находит расхождения и пропущенные реквизиты. Каждое замечание указывает на фрагмент документа. Работает на серверах компании на локальной LLM.",
    stack: "Qwen3:8B · GLM-OCR · MarkItDown · FastAPI",
  },
  {
    tag: "медицина · RAG",
    metric: "2 000+",
    outcome: "страниц документации в одном Telegram-боте",
    title: "AI-ассистент техподдержки сети клиник",
    text: "Отвечает сотрудникам по работе с медицинской информационной системой — только по внутренней документации и со ссылкой на первоисточник.",
    stack: "GPT-4o · FAISS · Telegram Bot API",
  },
  {
    tag: "медицина · RAG",
    outcome: "Каждый ответ прослеживается до документа",
    title: "RAG-система для медицинского учреждения",
    text: "Ответы врачам и администрации по историям болезни, протоколам и нормативным актам — только по проверенным источникам. Внедрена в рабочие процессы.",
    stack: "FAISS · Transformers · FastAPI",
  },
  {
    tag: "недвижимость",
    outcome: "Оценка стоимости по рыночным аналогам",
    title: "AI-анализ объектов недвижимости",
    text: "Собирает рыночные данные, подбирает аналоги по локации, площади и состоянию и готовит аналитический отчёт. Каждый вывод — со ссылками на объекты.",
    stack: "Claude API · CIAN API · FastAPI",
  },
  {
    tag: "computer vision · RL",
    outcome: "Распознавание с БПЛА в реальном времени",
    title: "Computer Vision и робототехника",
    text: "Обработка видеопотока с БПЛА, сопоставление изображений для промышленной среды, автообучение моделей в CVAT и RL-агент для посадки дрона на платформу.",
    stack: "YOLO · OpenCV · PyTorch · stable_baselines3",
  },
];

const stats = [
  { value: "6+ лет", label: "в разработке ПО" },
  { value: "4 года", label: "ML в продакшне" },
  { value: "15+", label: "проектов и внедрений" },
];

const why = [
  {
    title: "Экспертиза",
    text: "Вся техническая команда — выпускники или студенты МГУ, МГТУ им. Баумана и НИЯУ МИФИ. Победители и призёры AI-хакатонов и олимпиад.",
  },
  {
    title: "Прозрачность",
    text: "На каждом этапе — демо, метрики качества, доступ к репозиторию и трекеру задач.",
  },
  {
    title: "С кем работаем",
    text: "С компаниями, где есть сложные интеллектуальные процессы, большие объёмы данных и понятный экономический эффект.",
  },
];

const pad = (n: number) => String(n).padStart(2, "0");

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

        <section className="dark" id="cases" aria-labelledby="cases-title">
          <div className="dark-head">
            <p className="eyebrow">кейсы</p>
            <h2 className="dark-title" id="cases-title">
              Что мы уже <em>сделали.</em>
            </h2>
          </div>

          <div className="set">
            <div className="cards">
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
              давайте
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
