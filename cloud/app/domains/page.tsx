import type { Metadata } from "next";
import { Header, Footer, PreviewNotice } from "@cloud/components/ui";
import { DomainSearch } from "@cloud/components/catalog";
import { currentUser } from "@cloud/lib/auth";
import { money, zones } from "@cloud/lib/catalog";
export const metadata: Metadata = { title: "Домены" };
export default async function DomainsPage() {
  return (
    <>
      <Header signedIn={Boolean(await currentUser())} />
      <main id="main" className="wrap catalog-page">
        <div className="page-intro">
          <p className="eyebrow">KERNELL CLOUD / ДОМЕНЫ</p>
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
        <PreviewNotice />
        <DomainSearch />
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
                {zones.map((zone) => (
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
            Предварительные розничные цены. Подбор пока не проверяет свободность
            доменов.
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
          <summary>Можно ли управлять DNS в кабинете?</summary>
          <p>
            Интерфейс управления предусмотрен. В демокабинете можно попробовать
            изменение NS-серверов; реальные изменения станут доступны после
            запуска.
          </p>
        </details>
      </main>
      <Footer />
    </>
  );
}
