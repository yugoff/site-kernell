import type { Metadata } from "next";
import { Cpu, HardDrive, Terminal } from "lucide-react";
import { Header, Footer } from "@cloud/components/ui";
import { VpsCatalog, type PublicVpsPlan } from "@cloud/components/catalog";
import { currentUser } from "@cloud/lib/auth";
import {
  TIMEWEB_LOCATION_LABELS,
  getVpsCatalogData,
} from "@cloud/lib/catalog-service";
export const metadata: Metadata = { title: "VPS-серверы" };
export default async function VpsPage() {
  const [user, catalog] = await Promise.all([
    currentUser(),
    getVpsCatalogData(),
  ]);
  const live = catalog.source !== "fallback";
  const featuredPlans: PublicVpsPlan[] | undefined = live
    ? catalog.presets.slice(0, 4).map((p, index) => ({
        id: String(p.id),
        name: p.description_short || `VPS ${p.cpu} vCPU`,
        description: p.description || "NVMe-диск, публичный IPv4 и управление из кабинета",
        price: p.retailPrice,
        cpu: p.cpu,
        ram: Math.max(1, Math.round(p.ram / 1024)),
        disk: Math.max(1, Math.round(p.disk / 1024)),
        ...(index === 1 ? { popular: true } : {}),
      }))
    : undefined;
  const availableLocations = live
    ? catalog.locations.map((l) => ({
        id: l.location,
        label: TIMEWEB_LOCATION_LABELS[l.location] || l.location,
      }))
    : undefined;
  return (
    <>
      <Header signedIn={Boolean(user)} />
      <main id="main" className="wrap catalog-page">
        <div className="page-intro">
          <p className="eyebrow eyebrow-hero">kernell cloud · VPS-серверы</p>
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
        <VpsCatalog
          availableLocations={availableLocations}
          featuredPlans={featuredPlans}
          liveCatalog={live}
        />
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
          <summary>Как быстро создаётся сервер после оплаты?</summary>
          <p>
            После пополнения баланса и оплаты заказа в личном кабинете сервер
            автоматически ставится на установку ОС и обычно готов через 1–2
            минуты. Доступ по SSH и root-пароль сразу появляются в карточке
            сервера.
          </p>
        </details>
        <details className="faq-item">
          <summary>Что входит в стоимость?</summary>
          <p>
            Выделенные vCPU, RAM, NVMe-диск, публичный IPv4-адрес, базовая
            пропускная способность и круглосуточное управление питанием,
            бэкапами и переустановкой ОС.
          </p>
        </details>
      </main>
      <Footer />
    </>
  );
}
