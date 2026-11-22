import type { Metadata } from "next";
import { Cpu, HardDrive, Terminal } from "lucide-react";
import { Header, Footer, PreviewNotice } from "@cloud/components/ui";
import { VpsCatalog } from "@cloud/components/catalog";
import { currentUser } from "@cloud/lib/auth";
export const metadata: Metadata = { title: "VPS-серверы" };
export default async function VpsPage() {
  return (
    <>
      <Header signedIn={Boolean(await currentUser())} />
      <main id="main" className="wrap catalog-page">
        <div className="page-intro">
          <p className="eyebrow">KERNELL CLOUD / VPS</p>
          <h1>
            Сервер под
            <br />
            <em>вашу задачу.</em>
          </h1>
          <p>
            Для сайтов, ботов и приложений.
            <br />
            Выберите ресурсы — остальное соберём в одном кабинете.
          </p>
        </div>
        <PreviewNotice />
        <VpsCatalog />
        <div className="product-details">
          <article>
            <Cpu />
            <h3>Понятные конфигурации</h3>
            <p>
              Процессор, память и диск указаны отдельно. Выбирайте то, что нужно
              вашему приложению.
            </p>
          </article>
          <article>
            <HardDrive />
            <h3>Быстрые NVMe-диски</h3>
            <p>
              Конфигурации для баз данных, рабочих проектов и ваших
              экспериментов.
            </p>
          </article>
          <article>
            <Terminal />
            <h3>Привычный Linux</h3>
            <p>
              Ubuntu, Debian или AlmaLinux. Доступ по SSH и управление сервером
              из кабинета.
            </p>
          </article>
        </div>
        <details className="faq-item">
          <summary>Когда можно будет купить сервер?</summary>
          <p>
            Сейчас открыт предварительный просмотр. Можно создать аккаунт и
            сохранить заказ. Оплату включим после запуска сервиса.
          </p>
        </details>
        <details className="faq-item">
          <summary>Что входит в стоимость?</summary>
          <p>
            Это предварительные конфигурации и цены. Перед открытием продаж в
            каждом тарифе будет указан полный состав, включая IPv4, трафик и
            дополнительные услуги.
          </p>
        </details>
      </main>
      <Footer />
    </>
  );
}
