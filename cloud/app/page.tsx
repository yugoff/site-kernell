import Link from "next/link";
import {
  Box,
  Check,
  Globe2,
  Layers3,
  Server,
  Terminal,
  Wallet,
} from "lucide-react";
import {
  Header,
  Footer,
  DemoButton,
  PreviewNotice,
} from "@cloud/components/ui";
import { DomainSearch, PlanCards } from "@cloud/components/catalog";
import { currentUser } from "@cloud/lib/auth";

export default async function Home() {
  const user = await currentUser();
  return (
    <>
      <Header signedIn={Boolean(user)} />
      <main id="main">
        <section className="hero wrap">
          <div className="hero-copy">
            <p className="eyebrow">
              <span className="tiny-square" /> KERNELL / CLOUD
            </p>
            <h1>
              Ваш проект.
              <br />
              Наше <span className="highlight">облако.</span>
            </h1>
            <p className="hero-description">
              Домен для идеи. Сервер для запуска.
              <br />
              Всё, что нужно проекту, — в одном кабинете.
            </p>
            <div className="hero-actions">
              <Link href="/vps" className="button button-accent">
                Выбрать сервер
              </Link>
              <DemoButton />
            </div>
            <p className="hero-footnote mono">
              От первого бота до собственного сервиса.
            </p>
          </div>
          <div
            className="hero-machine"
            aria-label="Пример сервера с конфигурацией 2 vCPU, 4 ГБ RAM и 50 ГБ NVMe"
          >
            <div className="machine-grid" />
            <div className="machine-caption mono">
              <span>YOUR NEXT BIG THING</span>
              <Box size={18} />
            </div>
            <div className="machine-orbit orbit-one" />
            <div className="machine-orbit orbit-two" />
            <div className="server-stack">
              <div className="server-slab slab-top">
                <span className="slab-symbol">
                  k<span>_</span>
                </span>
                <div className="slab-vents">||||||||||||</div>
              </div>
              <div className="server-slab slab-mid">
                <span>compute</span>
                <div className="slab-lights">
                  <i />
                  <i />
                  <i />
                </div>
              </div>
              <div className="server-slab slab-bottom">
                <span>storage</span>
                <span className="mono">NVMe</span>
              </div>
            </div>
            <div className="machine-float float-one">
              <Server size={18} />
              <span>2 vCPU</span>
            </div>
            <div className="machine-float float-two">
              <Layers3 size={18} />
              <span>4 ГБ RAM</span>
            </div>
            <div className="machine-terminal">
              <div className="terminal-title">
                <Terminal size={15} />
                <span>your-project</span>
                <span className="terminal-demo">пример</span>
              </div>
              <p>
                <span>~</span> инфраструктура готова к идеям
                <span className="cursor">_</span>
              </p>
              <div className="terminal-resources">
                <span>
                  CPU <b>2 ядра</b>
                </span>
                <span>
                  RAM <b>4 ГБ</b>
                </span>
                <span>
                  SSD <b>50 ГБ</b>
                </span>
              </div>
            </div>
          </div>
        </section>
        <div className="wrap">
          <PreviewNotice />
        </div>
        <section className="section wrap">
          <div className="section-heading">
            <div>
              <p className="eyebrow">НАЧНИТЕ С ИМЕНИ</p>
              <h2>
                У каждой идеи
                <br />
                есть свой <em>адрес.</em>
              </h2>
            </div>
            <p>
              Найдите имя для сайта, приложения
              <br />
              или следующего большого проекта.
            </p>
          </div>
          <DomainSearch compact />
        </section>
        <section className="section plans-section">
          <div className="wrap">
            <div className="section-heading">
              <div>
                <p className="eyebrow">ВЫЧИСЛИТЕЛЬНАЯ МОЩНОСТЬ</p>
                <h2>
                  Ресурсы под
                  <br />
                  ваш <em>масштаб.</em>
                </h2>
              </div>
              <Link className="text-link" href="/vps">
                Подробнее о серверах
              </Link>
            </div>
            <PlanCards />
            <p className="pricing-note">
              Предварительные тарифы для знакомства с сервисом. Покупки станут
              доступны после запуска.
            </p>
          </div>
        </section>
        <section className="section wrap">
          <div className="workspace-grid">
            <div>
              <p className="eyebrow">ВСЁ ПОД РУКОЙ</p>
              <h2>
                Меньше вкладок.
                <br />
                <em>Больше дела.</em>
              </h2>
              <p className="section-description">
                Серверы, домены и финансы собраны в одном пространстве.
                Посмотрите, как будет устроена работа с вашей инфраструктурой.
              </p>
              <DemoButton className="button button-accent">
                Открыть демокабинет
              </DemoButton>
            </div>
            <div className="workspace-preview">
              <div className="preview-top">
                <span className="mono">cloud.kernell.ru / обзор</span>
                <span className="tag">Демо</span>
              </div>
              <div className="preview-greeting">
                Привет, Александр<span>Ваши проекты под контролем.</span>
              </div>
              <div className="preview-counts">
                <div>
                  <Server />
                  <strong>2</strong>
                  <span>сервера</span>
                </div>
                <div>
                  <Globe2 />
                  <strong>2</strong>
                  <span>домена</span>
                </div>
                <div>
                  <Wallet />
                  <strong>2 480 ₽</strong>
                  <span>демобаланс</span>
                </div>
              </div>
              <div className="preview-service">
                <span className="status-dot" />
                <div>
                  <b>production-01</b>
                  <span>2 vCPU · 4 ГБ RAM · Москва</span>
                </div>
                <Check size={18} />
              </div>
            </div>
          </div>
        </section>
        <section className="closing-band">
          <div className="wrap">
            <p className="eyebrow">СЛЕДУЮЩИЙ ШАГ — ВАШ</p>
            <h2>
              Идеям нужно место.
              <br />
              Давайте его <em>найдём.</em>
            </h2>
            <Link href="/register" className="button button-light">
              Создать аккаунт
            </Link>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
