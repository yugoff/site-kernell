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
  CreditCard,
  ExternalLink,
  Globe2,
  Layers3,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  Mail,
  Menu,
  Plus,
  Search,
  Server,
  Settings2,
  ShoppingBag,
  Terminal,
  Trash2,
  Wallet,
  X,
} from "lucide-react";
import { api, clientUuid, Logo, Modal } from "./ui";
import { DomainSearch, PlanCards } from "./catalog";
import { InfraOrderForm } from "./infra-order-form";
import { PurchaseForm } from "./purchase-form";
import {
  ServiceDetails,
  ServiceStatus,
  SshKeysPanel,
} from "./service-details";
import {
  SERVICE_KIND_LABELS,
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
  { id: "infra", icon: Layers3 },
  { id: "billing", icon: Wallet },
  { id: "orders", icon: ShoppingBag },
] as const;
const sectionHref = (section: Section) =>
  section === "overview" ? "/dashboard" : `/dashboard/${section}`;

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
  initialPaymentId,
}: {
  initial: Account;
  section: Section;
  initialCreate?: string;
  initialPaymentId?: string;
}) {
  const [account, setAccount] = useState(initial);
  const [menu, setMenu] = useState(false);
  const [modal, setModal] = useState<
    "server" | "domain" | "infra" | "balance" | "notifications" | null
  >(initialCreate ? "server" : null);
  const [selection, setSelection] = useState(initialCreate || "project");
  const [detail, setDetail] = useState<Service | null>(null);
  const [toast, setToast] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [payingOrderId, setPayingOrderId] = useState<string | null>(null);
  const [deletingOrderId, setDeletingOrderId] = useState<string | null>(null);
  const router = useRouter();
  const servers = account.services.filter((service) => service.kind === "vps");
  const domains = account.services.filter(
    (service) => service.kind === "domain",
  );
  const infraServices = account.services.filter(
    (service) => service.kind !== "vps" && service.kind !== "domain",
  );
  const s3Buckets = account.services.filter((service) => service.kind === "s3");
  const monthly = account.services
    .filter((service) => service.kind !== "domain")
    .reduce((sum, service) => sum + service.price, 0);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 5000);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (!initialPaymentId || account.user.demo) return;
    let active = true;
    void api(`/api/billing/payments/${encodeURIComponent(initialPaymentId)}/sync`, {})
      .then(async (result) => {
        if (!active) return;
        const next = await api("/api/account");
        if (!active) return;
        setAccount(next as Account);
        if (result.status === "succeeded") {
          setToast("Оплата подтверждена, баланс пополнен.");
        } else if (result.status === "canceled") {
          setToast("Платёж отменён.");
        } else {
          setToast("Проверяем статус платежа ЮKassa…");
        }
        router.replace(sectionHref(section));
      })
      .catch(() => {
        if (active) router.replace(sectionHref(section));
      });
    return () => {
      active = false;
    };
  }, [initialPaymentId, account.user.demo, router, section]);
  const hasPendingServices =
    !account.user.demo &&
    account.services.some(
      (service) =>
        service.status === "provisioning" || service.status === "reinstalling",
    );
  useEffect(() => {
    if (!hasPendingServices) return;
    const interval = setInterval(() => {
      void api("/api/account")
        .then((data) => setAccount(data as Account))
        .catch(() => null);
    }, 5000);
    return () => clearInterval(interval);
  }, [hasPendingServices]);
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
        (filter === "all" ||
          (filter === "infra"
            ? service.kind !== "vps" && service.kind !== "domain"
            : service.kind === filter)) &&
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
              { id: "infra", label: "Инфраструктура" },
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
                  ) : service.kind === "domain" ? (
                    <Globe2 size={21} />
                  ) : (
                    <Layers3 size={21} />
                  )}
                </span>
                <span className="service-name">
                  <strong>{service.name}</strong>
                  <small>
                    {service.kind === "domain"
                      ? "Домен · ежегодное продление"
                      : `${SERVICE_KIND_LABELS[service.kind]} · ${service.details.split("|")[0]}`}
                  </small>
                </span>
                <span className="service-location">
                  {service.kind === "domain"
                    ? "DNS и настройки"
                    : service.details.split("|")[1] || "Облако"}
                </span>
                <ServiceStatus value={service.status} />
                <span className="service-cost">
                  {service.price > 0 ? money(service.price) : "Бесплатно"}
                  {service.price > 0 && (
                    <small> / {service.kind === "domain" ? "год" : "мес."}</small>
                  )}
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
  async function payOrder(orderId: string) {
    setPayingOrderId(orderId);
    try {
      const result = await api(`/api/orders/${encodeURIComponent(orderId)}/pay`, {});
      await refresh();
      setToast(
        result.alreadyPaid
          ? "Заказ уже оплачен."
          : result.status === "active"
            ? "Заказ оплачен, услуга готова к работе."
            : result.status === "provisioning"
              ? "Заказ оплачен, запускаем создание услуги…"
              : "Заказ оплачен с баланса и передан в очередь запуска.",
      );
    } catch (error) {
      await refresh().catch(() => null);
      setToast((error as Error).message);
    } finally {
      setPayingOrderId(null);
    }
  }
  async function deleteOrder(orderId: string) {
    setDeletingOrderId(orderId);
    try {
      await api(
        `/api/orders?id=${encodeURIComponent(orderId)}`,
        undefined,
        "DELETE",
      );
      await refresh();
      setToast("Заказ удалён.");
    } catch (error) {
      setToast((error as Error).message);
    } finally {
      setDeletingOrderId(null);
    }
  }
  function orderStatusLabel(status: string) {
    if (status === "demo") return { text: "Пример оплаты", green: true };
    if (status === "paid") return { text: "Оплачен", green: true };
    if (status === "provisioning") return { text: "Создаётся", green: true };
    if (status === "active") return { text: "Выполнен", green: true };
    if (status === "failed") return { text: "Отклонён (возврат)", green: false };
    return { text: "Черновик", green: false };
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
              <th>Действие</th>
            </tr>
          </thead>
          <tbody>
            {account.orders.map((order) => {
              const badge = orderStatusLabel(order.status);
              const canDelete =
                order.status === "draft" ||
                order.status === "demo" ||
                order.status === "failed";
              const canPay = !account.user.demo && order.status === "draft";
              const isBusy =
                payingOrderId === order.id || deletingOrderId === order.id;
              return (
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
                    <span className={`tag ${badge.green ? "tag-green" : ""}`}>
                      {badge.text}
                    </span>
                  </td>
                  <td className="order-actions-cell">
                    {canPay || canDelete ? (
                      <div className="order-actions-group">
                        {canPay && (
                          <button
                            type="button"
                            className="button button-small button-outline"
                            disabled={isBusy}
                            onClick={() => payOrder(order.id)}
                          >
                            {payingOrderId === order.id && (
                              <LoaderCircle size={14} className="spin" />
                            )}
                            Оплатить с баланса
                          </button>
                        )}
                        {canDelete && (
                          <button
                            type="button"
                            className="button button-small button-order-delete"
                            disabled={isBusy}
                            onClick={() => deleteOrder(order.id)}
                            aria-label={`Удалить заказ ${order.title}`}
                          >
                            {deletingOrderId === order.id ? (
                              <LoaderCircle size={14} className="spin" />
                            ) : (
                              <Trash2 size={14} />
                            )}
                            Удалить
                          </button>
                        )}
                      </div>
                    ) : (
                      <span className="small muted">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
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
              {item.id === "infra" && (
                <span className="nav-count">{infraServices.length}</span>
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
              {account.user.demo
                ? "Демокабинет"
                : account.timewebEnabled && account.yookassaEnabled
                  ? "Боевой режим"
                  : "Ранний доступ"}
            </span>
            <span>
              {account.user.demo
                ? "Здесь можно всё попробовать. Услуги и баланс — примеры, деньги не списываются."
                : account.timewebEnabled && account.yookassaEnabled
                  ? "Пополнение через ЮKassa (54-ФЗ), запуск VPS и регистрация доменов работают автоматически."
                  : "Можно сохранять заказы, заполнять анкеты и проверять работу кабинета."}
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
                  ? "облако, в котором всё на месте"
                  : "личный кабинет"}
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
                      : section === "infra"
                        ? "Базы данных, S3-бакеты, Kubernetes, балансировщики, сети и CDN."
                        : section === "billing"
                          ? "Баланс, расходы и история операций."
                          : section === "orders"
                            ? "Все конфигурации и заказы в одном месте."
                            : section === "settings"
                              ? "Ваш профиль и безопасность аккаунта."
                              : "Поможем разобраться и найти решение."}
              </p>
            </div>
            {["overview", "servers", "domains", "infra"].includes(section) && (
              <button
                className="button button-accent"
                onClick={() =>
                  section === "infra"
                    ? setModal("infra")
                    : order(
                        section === "domains" ? "domain" : "server",
                        section === "domains" ? "" : "project",
                      )
                }
              >
                <Plus size={18} />
                {section === "domains"
                  ? "Добавить домен"
                  : section === "infra"
                    ? "Добавить ресурс"
                    : "Создать сервер"}
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
                  <strong>{servers.length}</strong>
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
                  <strong>{domains.length}</strong>
                  <p>
                    {domains.length
                      ? "Имена ваших проектов"
                      : "Имя для следующей идеи"}
                  </p>
                </article>
                <article className="stat-card">
                  <div>
                    <span>Расходы в месяц</span>
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
                  <p className="eyebrow">от идеи к запуску</p>
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
              <PlanCards mobileCarousel onSelect={(id) => order("server", id)} />
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
          {section === "infra" && (
            <section className="panel services-panel">
              <div className="panel-heading">
                <h2>Облачная инфраструктура</h2>
                <span className="mono muted">{infraServices.length} всего</span>
              </div>
              {infraServices.length ? (
                serviceList(infraServices)
              ) : (
                <Empty
                  icon={<Layers3 />}
                  title="DBaaS, S3, Kubernetes и сети"
                  text="Создавайте управляемые базы данных, объектное хранилище, кластеры K8s, балансировщики, CDN, VPC и Firewall."
                  action={
                    <button
                      className="button button-accent"
                      onClick={() => setModal("infra")}
                    >
                      Добавить ресурс
                    </button>
                  }
                />
              )}
            </section>
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
                    Текущие ежемесячные подписки и ресурсы —{" "}
                    <strong>{money(monthly)} в месяц</strong>. Домены
                    продлеваются отдельно раз в год.
                  </p>
                  <span
                    className={`tag ${account.yookassaEnabled ? "tag-green" : ""}`}
                  >
                    {account.yookassaEnabled
                      ? "ЮKassa подключена (54-ФЗ)"
                      : "Оплата пока недоступна"}
                  </span>
                </article>
              </div>
              {!account.user.demo && (account.ledger?.length || 0) > 0 && (
                <section className="panel billing-ledger-panel">
                  <div className="panel-heading">
                    <h2>Движение средств</h2>
                  </div>
                  <div className="table-scroll">
                    <table className="orders-table">
                      <thead>
                        <tr>
                          <th>Операция</th>
                          <th>Дата</th>
                          <th>Сумма</th>
                        </tr>
                      </thead>
                      <tbody>
                        {account.ledger?.map((entry) => (
                          <tr key={entry.id}>
                            <td>
                              <strong>{entry.note || entry.kind}</strong>
                            </td>
                            <td>{dateLabel(entry.createdAt)}</td>
                            <td
                              className={`nowrap ${
                                entry.direction === "credit"
                                  ? "ledger-amount-credit"
                                  : "ledger-amount-debit"
                              }`}
                            >
                              {entry.direction === "credit" ? "+" : "−"}
                              {money(entry.amountRub)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
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
              notify={(message) => setToast(message)}
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
                  <summary>Как создать сервер или зарегистрировать домен?</summary>
                  <p>
                    Пополните баланс в разделе «Финансы», выберите сервер или
                    домен, сохраните конфигурацию и нажмите «Оплатить с баланса»
                    в разделе «Заказы» — создание запустится автоматически.
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
            persons={account.domainPersons}
            sshKeys={account.sshKeys}
            demo={account.user.demo}
            timewebEnabled={account.timewebEnabled}
            done={orderDone}
          />
        </Modal>
      )}
      {modal === "infra" && (
        <Modal title="Новый сервис инфраструктуры" close={closeModal}>
          <InfraOrderForm
            s3Buckets={s3Buckets}
            done={async (instantCreated) => {
              closeModal();
              await refresh();
              setToast(
                instantCreated
                  ? "Сетевой ресурс создан и готов к работе."
                  : "Заказ сохранён. Оплатите его в разделе «Заказы» для автоматического запуска.",
              );
            }}
          />
        </Modal>
      )}
      {modal === "balance" && (
        <Modal title="Пополнение баланса" close={closeModal}>
          {!account.user.demo && account.yookassaEnabled ? (
            <TopupForm
              email={account.user.email}
              onClose={closeModal}
              onDone={async (message) => {
                await refresh();
                setToast(message);
              }}
            />
          ) : (
            <div className="payment-preview">
              <Wallet size={36} />
              <h3>Скоро здесь появится оплата.</h3>
              <p>
                Сейчас открыт предварительный просмотр. Пополнение баланса и
                оплата через ЮKassa будут включены после подключения ключей
                магазина.
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
          )}
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
            timewebEnabled={account.timewebEnabled}
            updated={async (message) => {
              const next = await refresh();
              setDetail(
                next.services.find((service) => service.id === detail.id) ||
                  null,
              );
              setToast(message);
            }}
            onDeleted={async () => {
              setDetail(null);
              await refresh();
              setToast("Сервер удалён.");
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

function ProfileForm({
  account,
  saved,
  notify,
}: {
  account: Account;
  saved: () => Promise<void>;
  notify: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [error, setError] = useState("");
  const [personOpen, setPersonOpen] = useState(false);
  const [personType, setPersonType] = useState<"person" | "ip" | "org">("person");
  const [personBusy, setPersonBusy] = useState(false);
  const [personError, setPersonError] = useState("");

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

  async function requestEmailVerification() {
    setVerifyBusy(true);
    try {
      const result = await api("/api/auth/verify-email", {});
      notify(result.message);
    } catch (err) {
      notify((err as Error).message);
    } finally {
      setVerifyBusy(false);
    }
  }

  async function savePerson(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPersonBusy(true);
    setPersonError("");
    const element = event.currentTarget;
    const form = new FormData(element);
    try {
      await api("/api/persons", {
        type: personType,
        name: form.get("name"),
        isResident: form.get("isResident") === "on",
        countryCode: form.get("countryCode"),
        birthdate: form.get("birthdate"),
        passportSeries: form.get("passportSeries"),
        passportNumber: form.get("passportNumber"),
        passportDate: form.get("passportDate"),
        passportPlace: form.get("passportPlace"),
        inn: form.get("inn"),
        kpp: form.get("kpp"),
        contactName: form.get("contactName"),
        legalAddress: form.get("legalAddress"),
        postcode: form.get("postcode"),
        mailingAddress: form.get("mailingAddress"),
        phone: form.get("phone"),
        email: form.get("email"),
      });
      element.reset();
      setPersonOpen(false);
      await saved();
    } catch (err) {
      setPersonError((err as Error).message);
    } finally {
      setPersonBusy(false);
    }
  }

  async function deletePerson(id: string) {
    try {
      await api(`/api/persons?id=${encodeURIComponent(id)}`, undefined, "DELETE");
      await saved();
    } catch (err) {
      notify((err as Error).message);
    }
  }

  const persons = account.domainPersons ?? [];

  return (
    <div className="settings-stack">
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
          <span className="field-label-row">
            <span>Email</span>
            {!account.user.demo && (
              <span
                className={`tag ${account.user.emailVerified ? "tag-green" : ""}`}
              >
                {account.user.emailVerified ? "Подтверждён" : "Не подтверждён"}
              </span>
            )}
          </span>
          <input value={account.user.email} readOnly type="email" />
        </label>
        {!account.user.demo && !account.user.emailVerified && (
          <div className="email-verify-row">
            <p className="small muted">
              Подтвердите почту, чтобы защитить доступ к будущим покупкам и
              восстановлению пароля.
            </p>
            <button
              type="button"
              className="button button-small button-outline"
              onClick={requestEmailVerification}
              disabled={verifyBusy}
            >
              {verifyBusy && <LoaderCircle className="spin" size={15} />}
              Подтвердить email
            </button>
          </div>
        )}
        <p className="small muted">
          {account.user.demo
            ? "Это демонстрационный аккаунт. Не указывайте личные данные."
            : "Email используется для входа и восстановления пароля."}
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
      {!account.user.demo && (
        <section className="panel settings-form">
          <div className="panel-heading-inline">
            <div>
              <h2>Профили администраторов доменов</h2>
              <p className="small muted">
                Данные для регистрации доменов (хранятся в зашифрованном виде).
              </p>
            </div>
            <button
              type="button"
              className="button button-small button-outline"
              onClick={() => setPersonOpen(!personOpen)}
            >
              {personOpen ? "Скрыть форму" : "Добавить профиль"}
            </button>
          </div>
          {persons.length > 0 ? (
            <div className="person-list">
              {persons.map((person) => (
                <div className="person-row" key={person.id}>
                  <div>
                    <strong>{person.label}</strong>
                    <span className="small muted">{person.summary}</span>
                  </div>
                  <button
                    type="button"
                    className="button button-small button-outline"
                    onClick={() => deletePerson(person.id)}
                  >
                    Удалить
                  </button>
                </div>
              ))}
            </div>
          ) : (
            !personOpen && (
              <p className="small muted">
                Пока нет сохранённых профилей. Можно добавить заранее для быстрой
                регистрации доменов в .ru, .рф и международных зонах.
              </p>
            )
          )}
          {personOpen && (
            <form className="person-form" onSubmit={savePerson}>
              <div className="segmented" aria-label="Тип администратора">
                {[
                  { id: "person", label: "Физлицо" },
                  { id: "ip", label: "ИП" },
                  { id: "org", label: "Организация" },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={personType === item.id ? "selected" : ""}
                    onClick={() =>
                      setPersonType(item.id as "person" | "ip" | "org")
                    }
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <label className="field">
                {personType === "org" ? "Название организации" : "ФИО полностью"}
                <input
                  name="name"
                  placeholder={
                    personType === "org"
                      ? "ООО «Пример»"
                      : "Иванов Иван Иванович"
                  }
                  required
                />
              </label>
              {personType === "org" ? (
                <>
                  <div className="form-two">
                    <label className="field">
                      ИНН
                      <input name="inn" placeholder="7700000000" required />
                    </label>
                    <label className="field">
                      КПП (если есть)
                      <input name="kpp" placeholder="770001001" />
                    </label>
                  </div>
                  <label className="field">
                    Контактное лицо
                    <input
                      name="contactName"
                      placeholder="Иванов Иван Иванович"
                      required
                    />
                  </label>
                  <label className="field">
                    Юридический адрес
                    <input
                      name="legalAddress"
                      placeholder="г. Москва, ул. Примерная, д. 1"
                      required
                    />
                  </label>
                </>
              ) : (
                <>
                  <div className="form-two">
                    <label className="field">
                      Дата рождения
                      <input name="birthdate" type="date" required />
                    </label>
                    {personType === "ip" && (
                      <label className="field">
                        ИНН ИП
                        <input name="inn" placeholder="770000000000" required />
                      </label>
                    )}
                  </div>
                  <div className="form-two">
                    <label className="field">
                      Серия паспорта
                      <input name="passportSeries" placeholder="1234" required />
                    </label>
                    <label className="field">
                      Номер паспорта
                      <input name="passportNumber" placeholder="567890" required />
                    </label>
                  </div>
                  <div className="form-two">
                    <label className="field">
                      Дата выдачи паспорта
                      <input name="passportDate" type="date" required />
                    </label>
                    <label className="field">
                      Кем выдан паспорт
                      <input
                        name="passportPlace"
                        placeholder="ОВД / МВД..."
                        required
                      />
                    </label>
                  </div>
                </>
              )}
              <div className="form-two">
                <label className="field">
                  Почтовый индекс
                  <input name="postcode" placeholder="101000" required />
                </label>
                <label className="field">
                  Телефон
                  <input name="phone" placeholder="+79000000000" required />
                </label>
              </div>
              <label className="field">
                Почтовый адрес
                <input
                  name="mailingAddress"
                  placeholder="г. Москва, ул. Примерная, д. 1, кв. 1"
                  required
                />
              </label>
              <label className="field">
                Email администратора
                <input
                  name="email"
                  type="email"
                  defaultValue={account.user.email}
                  required
                />
              </label>
              <label className="checkbox-field">
                <input name="isResident" type="checkbox" defaultChecked />
                <span>Резидент Российской Федерации</span>
              </label>
              {personError && (
                <p className="form-error" role="alert">
                  {personError}
                </p>
              )}
              <button
                className="button button-accent"
                type="submit"
                disabled={personBusy}
              >
                {personBusy && <LoaderCircle className="spin" size={16} />}
                Сохранить профиль
              </button>
            </form>
          )}
        </section>
      )}
      {!account.user.demo && (
        <SshKeysPanel
          sshKeys={account.sshKeys ?? []}
          notify={notify}
          saved={saved}
        />
      )}
    </div>
  );
}

const TOPUP_PRESETS = [500, 1000, 3000, 5000];

function TopupForm({
  email,
  onClose,
  onDone,
}: {
  email: string;
  onClose: () => void;
  onDone: (message: string) => Promise<void>;
}) {
  const [amount, setAmount] = useState(1000);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [requestKey] = useState(() => clientUuid());

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await api("/api/billing/topup", {
        amountRub: Number(amount),
        requestKey,
      });
      if (result.confirmationUrl) {
        window.location.assign(result.confirmationUrl);
        return;
      }
      onClose();
      await onDone("Платёж создан.");
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form className="purchase-form" onSubmit={submit}>
      <p className="muted">
        Оплата банковской картой или по СБП через ЮKassa. Электронный чек по
        54-ФЗ придёт на <strong>{email}</strong>.
      </p>
      <div className="topup-presets">
        {TOPUP_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            className={`topup-chip ${amount === preset ? "selected" : ""}`}
            onClick={() => setAmount(preset)}
          >
            {money(preset)}
          </button>
        ))}
      </div>
      <label className="field">
        Сумма пополнения, ₽
        <input
          type="number"
          min={100}
          max={500000}
          step={1}
          value={amount}
          onChange={(event) => setAmount(Number(event.target.value))}
          required
        />
      </label>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button className="button button-accent full" type="submit" disabled={busy}>
        {busy && <LoaderCircle className="spin" size={18} />}
        Перейти к оплате в ЮKassa
      </button>
    </form>
  );
}
