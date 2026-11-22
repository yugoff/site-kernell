"use client";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Activity,
  Bell,
  Check,
  ChevronDown,
  CircleHelp,
  Copy,
  CreditCard,
  ExternalLink,
  Globe2,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  Mail,
  Menu,
  Plus,
  Power,
  RotateCw,
  Search,
  Server,
  Settings2,
  ShoppingBag,
  Terminal,
  Wallet,
  X,
} from "lucide-react";
import { api, Logo, Modal } from "./ui";
import { DomainSearch, PlanCards } from "./catalog";
import { PurchaseForm } from "./purchase-form";
import {
  dateLabel,
  money,
  sectionNames,
  type Account,
  type Section,
  type Service,
} from "@cloud/lib/catalog";

const navigation = [
  { id: "overview", icon: LayoutDashboard },
  { id: "servers", icon: Server },
  { id: "domains", icon: Globe2 },
  { id: "billing", icon: Wallet },
  { id: "orders", icon: ShoppingBag },
] as const;
const sectionHref = (section: Section) =>
  section === "overview" ? "/dashboard" : `/dashboard/${section}`;

function Status({ value }: { value: Service["status"] }) {
  return (
    <span className={`service-status ${value === "stopped" ? "stopped" : ""}`}>
      <i />
      {value === "stopped"
        ? "Остановлен"
        : value === "active"
          ? "Активен"
          : "Работает"}
    </span>
  );
}
function Empty({
  icon,
  title,
  text,
  action,
}: {
  icon: ReactNode;
  title: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span>{icon}</span>
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  );
}

export function Dashboard({
  initial,
  section,
  initialCreate,
}: {
  initial: Account;
  section: Section;
  initialCreate?: string;
}) {
  const [account, setAccount] = useState(initial);
  const [menu, setMenu] = useState(false);
  const [modal, setModal] = useState<
    "server" | "domain" | "balance" | "notifications" | null
  >(initialCreate ? "server" : null);
  const [selection, setSelection] = useState(initialCreate || "project");
  const [detail, setDetail] = useState<Service | null>(null);
  const [toast, setToast] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [logoutBusy, setLogoutBusy] = useState(false);
  const router = useRouter();
  const servers = account.services.filter((service) => service.kind === "vps");
  const domains = account.services.filter(
    (service) => service.kind === "domain",
  );
  const monthly = servers.reduce((sum, server) => sum + server.price, 0);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 5000);
    return () => clearTimeout(timer);
  }, [toast]);
  async function refresh() {
    const data = await api("/api/account");
    setAccount(data);
    return data as Account;
  }
  async function logout(destination = "/login") {
    setLogoutBusy(true);
    try {
      await api("/api/auth/logout", {});
      router.replace(destination);
      router.refresh();
    } catch (error) {
      setToast((error as Error).message);
      setLogoutBusy(false);
    }
  }
  function closeModal() {
    setModal(null);
    if (initialCreate) router.replace(sectionHref(section));
  }
  function order(kind: "server" | "domain", value: string) {
    setSelection(value);
    setModal(kind);
  }
  async function orderDone() {
    closeModal();
    await refresh();
    setToast("Заказ сохранён. Вы найдёте его в разделе «Заказы».");
  }
  function serviceList(items: Service[]) {
    const visible = items.filter(
      (service) =>
        (filter === "all" || service.kind === filter) &&
        service.name.toLowerCase().includes(query.toLowerCase()),
    );
    return (
      <>
        <div className="service-tools">
          <div className="filter-tabs" aria-label="Тип услуг">
            {[
              { id: "all", label: "Все услуги" },
              { id: "vps", label: "Серверы" },
              { id: "domain", label: "Домены" },
            ]
              .filter((item) => section === "overview" || item.id === "all")
              .map((item) => (
                <button
                  key={item.id}
                  className={filter === item.id ? "active" : ""}
                  onClick={() => setFilter(item.id)}
                  aria-pressed={filter === item.id}
                >
                  {item.label}
                  {item.id === "all" && <span>{items.length}</span>}
                </button>
              ))}
          </div>
          <label className="inline-search">
            <Search size={17} />
            <span className="sr-only">Найти услугу</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Найти по имени"
            />
          </label>
        </div>
        {visible.length ? (
          <div className="service-list">
            {visible.map((service) => (
              <button
                key={service.id}
                className="service-row"
                onClick={() => setDetail(service)}
              >
                <span
                  className={`service-icon ${service.kind === "domain" ? "is-domain" : ""}`}
                >
                  {service.kind === "vps" ? (
                    <Server size={21} />
                  ) : (
                    <Globe2 size={21} />
                  )}
                </span>
                <span className="service-name">
                  <strong>{service.name}</strong>
                  <small>
                    {service.kind === "vps"
                      ? service.details.split("|")[0]
                      : "Домен · ежегодное продление"}
                  </small>
                </span>
                <span className="service-location">
                  {service.kind === "vps"
                    ? service.details.split("|")[1]
                    : "DNS и настройки"}
                </span>
                <Status value={service.status} />
                <span className="service-cost">
                  {money(service.price)}
                  <small> / {service.kind === "vps" ? "мес." : "год"}</small>
                </span>
                <span className="service-open">Управление</span>
              </button>
            ))}
          </div>
        ) : (
          <Empty
            icon={<Search />}
            title="Ничего не найдено"
            text="Попробуйте другое имя или измените фильтр."
          />
        )}
      </>
    );
  }
  function ordersTable() {
    return account.orders.length ? (
      <div className="table-scroll">
        <table className="orders-table">
          <thead>
            <tr>
              <th>Заказ</th>
              <th>Дата</th>
              <th>Сумма</th>
              <th>Статус</th>
            </tr>
          </thead>
          <tbody>
            {account.orders.map((order) => (
              <tr key={order.id}>
                <td>
                  <strong>{order.title}</strong>
                  <small className="mono">
                    #{order.id.slice(0, 8).toUpperCase()}
                  </small>
                </td>
                <td>{dateLabel(order.created)}</td>
                <td className="nowrap">{money(order.amount)}</td>
                <td>
                  <span
                    className={`tag ${order.status === "demo" ? "tag-green" : ""}`}
                  >
                    {order.status === "demo" ? "Пример оплаты" : "Черновик"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ) : (
      <Empty
        icon={<ShoppingBag />}
        title="История начинается здесь"
        text="Ваши заказы появятся в этом разделе. Выберите сервер или подберите домен."
        action={
          <button
            className="button button-accent"
            onClick={() => order("server", "project")}
          >
            Выбрать сервер
          </button>
        }
      />
    );
  }
  return (
    <div className="dashboard">
      <aside className={`sidebar ${menu ? "is-open" : ""}`}>
        <div className="sidebar-logo">
          <Logo />
          <button
            className="icon-button sidebar-close"
            onClick={() => setMenu(false)}
            aria-label="Закрыть меню"
          >
            <X />
          </button>
        </div>
        <div className="workspace-switch">
          <span className="workspace-avatar">
            {account.user.name.slice(0, 1).toUpperCase()}
          </span>
          <span>
            <strong>Мои проекты</strong>
            <small>Личное пространство</small>
          </span>
        </div>
        <span className="sidebar-label mono">УПРАВЛЕНИЕ</span>
        <nav aria-label="Личный кабинет">
          {navigation.map((item) => (
            <Link
              href={sectionHref(item.id)}
              key={item.id}
              className={section === item.id ? "active" : ""}
              aria-current={section === item.id ? "page" : undefined}
            >
              <item.icon size={19} />
              {sectionNames[item.id]}
              {item.id === "servers" && (
                <span className="nav-count">{servers.length}</span>
              )}
              {item.id === "domains" && (
                <span className="nav-count">{domains.length}</span>
              )}
            </Link>
          ))}
        </nav>
        <div className="sidebar-help">
          <span className="sidebar-label mono">ВАШ CLOUD</span>
          <nav aria-label="Помощь и настройки">
            <Link
              href="/dashboard/support"
              className={section === "support" ? "active" : ""}
            >
              <CircleHelp size={19} />
              Поддержка
            </Link>
            <Link
              href="/dashboard/settings"
              className={section === "settings" ? "active" : ""}
            >
              <Settings2 size={19} />
              Настройки
            </Link>
            <Link href="/vps">
              <Plus size={19} />
              Каталог услуг
            </Link>
          </nav>
        </div>
        <div className="sidebar-bottom">
          <span className="sidebar-mark mono">СОЗДАНО ДЛЯ ВАШИХ ИДЕЙ</span>
          <Link href="/" className="back-to-site">
            На сайт Kernell Cloud <ExternalLink size={14} />
          </Link>
        </div>
      </aside>
      {menu && (
        <button
          className="sidebar-scrim"
          aria-label="Закрыть меню"
          onClick={() => setMenu(false)}
        />
      )}
      <div className="dashboard-body">
        <header className="dashboard-header">
          <div>
            <button
              className="icon-button dashboard-menu"
              onClick={() => setMenu(true)}
              aria-label="Открыть меню"
            >
              <Menu />
            </button>
            <span className="muted">Рабочее пространство</span>
            <span className="breadcrumb-separator">/</span>
            <strong>{sectionNames[section]}</strong>
          </div>
          <div className="account-controls">
            <button
              className="icon-button notification-button"
              onClick={() => setModal("notifications")}
              aria-label="Открыть историю событий"
            >
              <Bell size={20} />
            </button>
            <Link href="/dashboard/settings" className="user-control">
              <span className="avatar">
                {account.user.name.slice(0, 1).toUpperCase()}
              </span>
              <span>{account.user.name}</span>
              <ChevronDown size={14} />
            </Link>
            <button
              className="icon-button logout"
              onClick={() => logout()}
              disabled={logoutBusy}
              aria-label="Выйти из кабинета"
            >
              {logoutBusy ? (
                <LoaderCircle className="spin" size={18} />
              ) : (
                <LogOut size={18} />
              )}
            </button>
          </div>
        </header>
        <main id="main" className="dashboard-main">
          <div className="dashboard-notice">
            <span className="tag">
              {account.user.demo ? "Демокабинет" : "Ранний доступ"}
            </span>
            <span>
              {account.user.demo
                ? "Здесь можно всё попробовать. Услуги и баланс — примеры, деньги не списываются."
                : "Кабинет готов к знакомству. Можно сохранить заказ; оплата и выдача услуг пока недоступны."}
            </span>
            {account.user.demo && (
              <button
                onClick={() => logout("/register")}
                disabled={logoutBusy}
                className="notice-link"
              >
                Создать свой аккаунт
              </button>
            )}
          </div>
          <div className="dashboard-title">
            <div>
              <p className="eyebrow">
                {section === "overview"
                  ? "ОБЛАКО, В КОТОРОМ ВСЁ НА МЕСТЕ"
                  : "ЛИЧНЫЙ КАБИНЕТ"}
              </p>
              <h1>
                {section === "overview" ? (
                  <>
                    Привет, {account.user.name}
                    <span className="greeting-period">.</span>
                  </>
                ) : (
                  sectionNames[section]
                )}
              </h1>
              <p>
                {section === "overview"
                  ? "Ваши проекты начинаются здесь."
                  : section === "servers"
                    ? "Вычислительная мощность для ваших задач."
                    : section === "domains"
                      ? "Адреса ваших проектов и управление ими."
                      : section === "billing"
                        ? "Баланс, расходы и история операций."
                        : section === "orders"
                          ? "Все конфигурации и заказы в одном месте."
                          : section === "settings"
                            ? "Ваш профиль и безопасность аккаунта."
                            : "Поможем разобраться и найти решение."}
              </p>
            </div>
            {["overview", "servers", "domains"].includes(section) && (
              <button
                className="button button-accent"
                onClick={() =>
                  order(
                    section === "domains" ? "domain" : "server",
                    section === "domains" ? "" : "project",
                  )
                }
              >
                <Plus size={18} />
                {section === "domains" ? "Добавить домен" : "Создать сервер"}
              </button>
            )}
          </div>
          {section === "overview" && (
            <>
              <div className="stats-grid">
                <article className="balance-card">
                  <div>
                    <span>Баланс {account.user.demo && "· демо"}</span>
                    <Wallet size={21} />
                  </div>
                  <strong>{money(account.balance)}</strong>
                  <button onClick={() => setModal("balance")}>
                    Пополнить баланс <Plus size={16} />
                  </button>
                </article>
                <article className="stat-card">
                  <div>
                    <span>Серверы</span>
                    <Server size={21} />
                  </div>
                  <strong>{servers.length.toString().padStart(2, "0")}</strong>
                  <p>
                    <span className="status-dot" />
                    {
                      servers.filter((server) => server.status === "running")
                        .length
                    }{" "}
                    в работе
                  </p>
                </article>
                <article className="stat-card">
                  <div>
                    <span>Домены</span>
                    <Globe2 size={21} />
                  </div>
                  <strong>{domains.length.toString().padStart(2, "0")}</strong>
                  <p>
                    {domains.length
                      ? "Имена ваших проектов"
                      : "Имя для следующей идеи"}
                  </p>
                </article>
                <article className="stat-card">
                  <div>
                    <span>Расходы на VPS</span>
                    <CreditCard size={21} />
                  </div>
                  <strong className="stat-money">{money(monthly)}</strong>
                  <p>в месяц {account.user.demo && "· пример"}</p>
                </article>
              </div>
              <div className="overview-columns">
                <section className="panel services-panel">
                  <div className="panel-heading">
                    <h2>Ваши услуги</h2>
                    <span className="mono muted">
                      {account.services.length} всего
                    </span>
                  </div>
                  {account.services.length ? (
                    serviceList(account.services)
                  ) : (
                    <Empty
                      icon={<Server />}
                      title="Место для первого проекта"
                      text="Начните с сервера или домена. Всё, что вы создадите, появится здесь."
                      action={
                        <button
                          className="button button-accent"
                          onClick={() => order("server", "project")}
                        >
                          Выбрать сервер
                        </button>
                      }
                    />
                  )}
                </section>
                <aside className="quick-start-card">
                  <span className="quick-icon">
                    <Terminal size={25} />
                  </span>
                  <p className="eyebrow">ОТ ИДЕИ К ЗАПУСКУ</p>
                  <h2>
                    Следующий
                    <br />
                    проект —<br />
                    <em>ваш.</em>
                  </h2>
                  <p>
                    Подберите конфигурацию
                    <br />
                    для новой задачи.
                  </p>
                  <button
                    className="button button-light"
                    onClick={() => order("server", "project")}
                  >
                    Выбрать ресурсы
                  </button>
                </aside>
              </div>
              <div className="overview-bottom">
                <section className="panel">
                  <div className="panel-heading">
                    <h2>Последние события</h2>
                    <Activity size={19} />
                  </div>
                  <ActivityList account={account} />
                </section>
                <section className="panel next-renewals">
                  <div className="panel-heading">
                    <h2>Ближайшие продления</h2>
                  </div>
                  {account.services.length ? (
                    [...account.services]
                      .sort((a, b) => a.renewal.localeCompare(b.renewal))
                      .slice(0, 3)
                      .map((service) => (
                        <div className="renewal-row" key={service.id}>
                          <div>
                            <strong>{service.name}</strong>
                            <span>{dateLabel(service.renewal)}</span>
                          </div>
                          <b>{money(service.price)}</b>
                        </div>
                      ))
                  ) : (
                    <p className="panel-empty">
                      Здесь появятся сроки продления ваших услуг.
                    </p>
                  )}
                </section>
              </div>
            </>
          )}
          {section === "servers" && (
            <>
              {servers.length > 0 && (
                <section className="panel services-panel">
                  {serviceList(servers)}
                </section>
              )}
              <div className="dashboard-section-heading">
                <h2>
                  {servers.length
                    ? "Ресурсы для нового проекта"
                    : "Выберите свой первый сервер"}
                </h2>
                <span className="muted small">Предварительные тарифы</span>
              </div>
              <PlanCards onSelect={(id) => order("server", id)} />
            </>
          )}
          {section === "domains" && (
            <>
              <DomainSearch onSelect={(name) => order("domain", name)} />
              <section className="panel services-panel domain-panel">
                <div className="panel-heading">
                  <h2>Ваши домены</h2>
                  <span className="mono muted">{domains.length} всего</span>
                </div>
                {domains.length ? (
                  serviceList(domains)
                ) : (
                  <Empty
                    icon={<Globe2 />}
                    title="Найдём имя вашему проекту"
                    text="Подберите домен в форме выше. Ваши домены будут собраны здесь."
                  />
                )}
              </section>
            </>
          )}
          {section === "billing" && (
            <>
              <div className="billing-summary">
                <article className="balance-card">
                  <div>
                    <span>Баланс {account.user.demo && "· демо"}</span>
                    <Wallet size={21} />
                  </div>
                  <strong>{money(account.balance)}</strong>
                  <button onClick={() => setModal("balance")}>
                    Пополнить баланс <Plus size={16} />
                  </button>
                </article>
                <article className="panel billing-info">
                  <h2>Понятные расходы</h2>
                  <p>
                    Предварительная стоимость ваших VPS —{" "}
                    <strong>{money(monthly)} в месяц</strong>. Домены
                    продлеваются отдельно раз в год.
                  </p>
                  <span className="tag">Оплата пока недоступна</span>
                </article>
              </div>
              <section className="panel">
                <div className="panel-heading">
                  <h2>Заказы и операции</h2>
                </div>
                {ordersTable()}
              </section>
            </>
          )}
          {section === "orders" && (
            <section className="panel">
              <div className="panel-heading">
                <h2>История заказов</h2>
                <span className="mono muted">
                  {account.orders.length} всего
                </span>
              </div>
              {ordersTable()}
              <p className="panel-footnote">
                Черновик не является счётом и не запускает покупку. Итоговые
                условия будут показаны перед оплатой.
              </p>
            </section>
          )}
          {section === "settings" && (
            <ProfileForm
              account={account}
              saved={async () => {
                await refresh();
                router.refresh();
                setToast("Настройки сохранены.");
              }}
            />
          )}
          {section === "support" && (
            <div className="support-grid">
              <section className="panel support-card">
                <Mail size={30} />
                <h2>Давайте разберёмся.</h2>
                <p>
                  Напишите, что хотите настроить или что пошло не так. Для
                  вопроса по заказу добавьте его номер из раздела «Заказы».
                </p>
                <a
                  className="button button-accent"
                  href={`mailto:info@kernell.ru?subject=${encodeURIComponent("Kernell Cloud — вопрос")}`}
                >
                  Написать в поддержку
                </a>
                <span className="mono">info@kernell.ru</span>
              </section>
              <section>
                <details className="faq-item" open>
                  <summary>Что можно сделать прямо сейчас?</summary>
                  <p>
                    Создать аккаунт, выбрать конфигурацию, сохранить заказ и
                    посмотреть демокабинет. Настоящие покупки и оплата пока
                    недоступны.
                  </p>
                </details>
                <details className="faq-item">
                  <summary>В демокабинете настоящие серверы?</summary>
                  <p>
                    Это изолированные примеры. Запуск, остановка и изменение NS
                    сохраняются только в вашем демокабинете и не влияют на
                    реальную инфраструктуру.
                  </p>
                </details>
                <details className="faq-item">
                  <summary>Как удалить аккаунт?</summary>
                  <p>
                    Напишите на info@kernell.ru с адреса, указанного при
                    регистрации.
                  </p>
                </details>
              </section>
            </div>
          )}
          <footer className="dashboard-footer">
            <span className="mono">kernell cloud</span>
            <Link href="/privacy">Конфиденциальность</Link>
            <a href="mailto:info@kernell.ru">Поддержка</a>
          </footer>
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          <Check size={18} />
          <span>{toast}</span>
          <button
            className="icon-button"
            onClick={() => setToast("")}
            aria-label="Закрыть уведомление"
          >
            <X size={16} />
          </button>
        </div>
      )}
      {(modal === "server" || modal === "domain") && (
        <Modal
          title={modal === "server" ? "Новый сервер" : "Новый домен"}
          close={closeModal}
        >
          <PurchaseForm
            kind={modal === "server" ? "vps" : "domain"}
            selection={selection}
            done={orderDone}
          />
        </Modal>
      )}
      {modal === "balance" && (
        <Modal title="Пополнение баланса" close={closeModal}>
          <div className="payment-preview">
            <Wallet size={36} />
            <h3>Скоро здесь появится оплата.</h3>
            <p>
              Сейчас открыт предварительный просмотр. Пополнение баланса и
              банковские платежи ещё не подключены.
            </p>
            {account.user.demo && (
              <p className="muted">
                Баланс {money(account.balance)} — демонстрационный.
              </p>
            )}
            <button className="button button-accent full" onClick={closeModal}>
              Понятно
            </button>
          </div>
        </Modal>
      )}
      {modal === "notifications" && (
        <Modal title="События в вашем облаке" close={closeModal}>
          <ActivityList account={account} />
        </Modal>
      )}
      {detail && (
        <Modal title={detail.name} close={() => setDetail(null)}>
          <ServiceDetails
            service={detail}
            demo={account.user.demo}
            updated={async (message) => {
              const next = await refresh();
              setDetail(
                next.services.find((service) => service.id === detail.id) ||
                  null,
              );
              setToast(message);
            }}
          />
        </Modal>
      )}
    </div>
  );
}

function ActivityList({ account }: { account: Account }) {
  return (
    <div className="activity-list">
      {account.activity.length ? (
        account.activity.map((item) => (
          <div key={item.id}>
            <span className="activity-marker">
              <Check size={12} />
            </span>
            <p>
              <strong>{item.title}</strong>
              <time dateTime={item.created}>{dateLabel(item.created)}</time>
            </p>
          </div>
        ))
      ) : (
        <p className="panel-empty">События ваших проектов появятся здесь.</p>
      )}
    </div>
  );
}

function ServiceDetails({
  service,
  demo,
  updated,
}: {
  service: Service;
  demo: boolean;
  updated: (message: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [copied, setCopied] = useState(false);
  const [nameservers, setNameservers] = useState(
    service.details.replaceAll("|", "\n"),
  );
  async function act(action: string, extra = {}) {
    setBusy(true);
    setError("");
    try {
      const result = await api(`/api/services/${service.id}`, {
        action,
        ...extra,
      });
      await updated(result.message);
      setConfirm(false);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(service.address);
      setCopied(true);
    } catch {
      setError("Не удалось скопировать. Выделите IP-адрес вручную.");
    }
  }
  return (
    <div className="service-details">
      <div className="detail-status">
        <Status value={service.status} />
        {demo && <span className="tag">Демонстрационная услуга</span>}
      </div>
      {service.kind === "vps" ? (
        <>
          <dl>
            <div>
              <dt>Конфигурация</dt>
              <dd>{service.details.split("|")[0]}</dd>
            </div>
            <div>
              <dt>Локация</dt>
              <dd>{service.details.split("|")[1]}</dd>
            </div>
            <div>
              <dt>Система</dt>
              <dd>{service.details.split("|")[2]}</dd>
            </div>
            <div>
              <dt>IP-адрес {demo && "(пример)"}</dt>
              <dd className="mono">
                {service.address}
                <button
                  className="icon-button"
                  onClick={copy}
                  aria-label="Скопировать IP-адрес"
                >
                  {copied ? <Check size={16} /> : <Copy size={16} />}
                </button>
              </dd>
            </div>
          </dl>
          {confirm ? (
            <div className="confirm-panel">
              <strong>Остановить {service.name}?</strong>
              <p>В деморежиме изменится только статус примера.</p>
              <div>
                <button
                  className="button button-small button-accent"
                  disabled={busy}
                  onClick={() => act("stop")}
                >
                  Остановить
                </button>
                <button
                  className="button button-small button-outline"
                  onClick={() => setConfirm(false)}
                >
                  Отмена
                </button>
              </div>
            </div>
          ) : (
            <div className="server-actions">
              <button
                className="button button-outline"
                disabled={busy || !demo}
                onClick={() =>
                  service.status === "running" ? setConfirm(true) : act("start")
                }
              >
                <Power size={17} />
                {service.status === "running" ? "Остановить" : "Запустить"}
              </button>
              <button
                className="button button-outline"
                disabled={busy || service.status !== "running" || !demo}
                onClick={() => act("restart")}
              >
                <RotateCw size={17} />
                Перезагрузить
              </button>
            </div>
          )}
        </>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            act("dns", {
              nameservers: nameservers.split(/\s+/).filter(Boolean),
            });
          }}
        >
          <label className="field">
            NS-серверы
            <textarea
              value={nameservers}
              onChange={(event) => setNameservers(event.target.value)}
              rows={4}
              required
              maxLength={1100}
            />
          </label>
          <p className="small muted">
            От 2 до 4 имён серверов, каждое с новой строки.
          </p>
          <button
            className="button button-outline full"
            disabled={busy || !demo}
          >
            Сохранить NS-серверы
          </button>
        </form>
      )}
      <div className="detail-renewal">
        <div>
          <strong>Автопродление</strong>
          <span>Следующий срок: {dateLabel(service.renewal)}</span>
        </div>
        <button
          role="switch"
          aria-checked={service.autoRenew}
          aria-label="Автопродление"
          className={`switch ${service.autoRenew ? "on" : ""}`}
          disabled={busy || !demo}
          onClick={() => act("renewal", { enabled: !service.autoRenew })}
        >
          <span />
        </button>
      </div>
      <p className="small muted">
        {demo
          ? "Все действия выполняются только с примером. Реальные серверы и домены не изменяются."
          : "Управление станет доступно после запуска."}
      </p>
      {busy && (
        <p className="secure-note">
          <LoaderCircle className="spin" size={16} />
          Сохраняем изменение…
        </p>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </div>
  );
}

function ProfileForm({
  account,
  saved,
}: {
  account: Account;
  saved: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const element = event.currentTarget;
    const form = new FormData(element);
    try {
      await api("/api/profile", {
        name: form.get("name"),
        currentPassword: form.get("currentPassword"),
        newPassword: form.get("newPassword"),
      });
      element.reset();
      await saved();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="panel settings-form" onSubmit={submit}>
      <h2>Личные данные</h2>
      <label className="field">
        Имя
        <input
          name="name"
          defaultValue={account.user.name}
          minLength={2}
          maxLength={70}
          autoComplete="given-name"
          required
        />
      </label>
      <label className="field">
        Email
        <input value={account.user.email} readOnly type="email" />
      </label>
      <p className="small muted">
        {account.user.demo
          ? "Это демонстрационный аккаунт. Не указывайте личные данные."
          : "Email используется для входа. Проверка адреса и восстановление пароля пока недоступны."}
      </p>
      {!account.user.demo && (
        <>
          <hr />
          <h2>Изменить пароль</h2>
          <p className="small muted">
            Оставьте поля пустыми, если хотите изменить только имя.
          </p>
          <label className="field">
            Текущий пароль
            <input
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              maxLength={128}
            />
          </label>
          <label className="field">
            Новый пароль
            <input
              name="newPassword"
              type="password"
              autoComplete="new-password"
              minLength={10}
              maxLength={128}
              placeholder="Не менее 10 символов"
            />
          </label>
        </>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button className="button button-accent" disabled={busy}>
        {busy && <LoaderCircle size={17} className="spin" />}Сохранить изменения
      </button>
    </form>
  );
}
