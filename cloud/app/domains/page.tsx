import type { Metadata } from "next";
import { Header, Footer } from "@cloud/components/ui";
import { DomainSearch } from "@cloud/components/catalog";
import { currentUser } from "@cloud/lib/auth";
import { money } from "@cloud/lib/catalog";
import { getDomainZonesCatalog } from "@cloud/lib/catalog-service";
export const metadata: Metadata = { title: "Домены" };
export default async function DomainsPage() {
  const [user, catalog] = await Promise.all([
    currentUser(),
    getDomainZonesCatalog(),
  ]);
  const displayedZones = catalog.zones.slice(0, 12);
  return (
    <>
      <Header signedIn={Boolean(user)} />
      <main id="main" className="wrap catalog-page">
        <div className="page-intro">
          <p className="eyebrow eyebrow-hero">kernell cloud · домены</p>
          <h1>
            Хорошие идеи
            <br />
            заслуживают <em>имени.</em>
          </h1>
          <p>
            Подберите адрес для своего проекта.
            <br />
            Регистрация, продление и настройки — в одном месте.
          </p>
        </div>
        <DomainSearch featuredZones={catalog.zones.slice(0, 4)} />
        <section className="domain-prices">
          <div className="section-heading">
            <h2>
              Цена сегодня.
              <br />
              <em>И через год.</em>
            </h2>
            <p>
              Показываем регистрацию и продление рядом,
              <br />
              чтобы было проще планировать расходы.
            </p>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Доменная зона</th>
                  <th>Регистрация / год</th>
                  <th>Продление / год</th>
                </tr>
              </thead>
              <tbody>
                {displayedZones.map((zone) => (
                  <tr key={zone.zone}>
                    <td>
                      <strong className="zone-name">.{zone.zone}</strong>
                    </td>
                    <td>{money(zone.registration)}</td>
                    <td>{money(zone.renewal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="pricing-note">
            {catalog.source === "fallback"
              ? "Предварительные розничные цены. Чтобы проверить другую зону, введите домен целиком."
              : `Розничные цены с учётом синхронизации каталога (${catalog.allPublishedCount} зон). Чтобы проверить любую зону, введите домен целиком.`}
          </p>
        </section>
        <details className="faq-item">
          <summary>На кого будет зарегистрирован домен?</summary>
          <p>
            На данные покупателя, указанные при оформлении. Kernell будет
            предоставлять интерфейс регистрации и управления.
          </p>
        </details>
        <details className="faq-item">
          <summary>Можно ли управлять DNS и NS в кабинете?</summary>
          <p>
            Да. В разделе «Домены» личного кабинета доступны смена NS-серверов,
            редактор DNS-записей (A, AAAA, TXT, CNAME, MX, SRV) и управление
            автопродлением.
          </p>
        </details>
      </main>
      <Footer />
    </>
  );
}
