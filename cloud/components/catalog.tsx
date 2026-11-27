"use client";
import Link from "next/link";
import { useState, type FormEvent, type UIEvent } from "react";
import { Check, Globe2, Search, Server, SlidersHorizontal } from "lucide-react";
import { locations, money, plans, zones } from "@cloud/lib/catalog";
import { domainCandidates, type DomainAvailability, type DomainMatch, type DomainSearchResult } from "@cloud/lib/domain-search";
import { api } from "./ui";

const availabilityLabels: Record<DomainAvailability, string> = {
  available: "Свободен",
  taken: "Занят",
  unavailable: "Не удалось проверить",
  unsupported: "Зона не поддерживается Timeweb",
};

export type PublicVpsPlan = {
  id: string;
  name: string;
  description: string;
  price: number;
  cpu: number;
  ram: number;
  disk: number;
  popular?: boolean;
};

export function PlanCards({
  onSelect,
  mobileCarousel = false,
  customPlans,
}: {
  onSelect?: (id: string) => void;
  mobileCarousel?: boolean;
  customPlans?: PublicVpsPlan[];
}) {
  const displayPlans: PublicVpsPlan[] = customPlans?.length
    ? customPlans
    : plans.map((item) => ({ ...item }));
  const [activePlan, setActivePlan] = useState(0);
  function updateActivePlan({ currentTarget: track }: UIEvent<HTMLDivElement>) {
    const first = track.children[0]?.getBoundingClientRect();
    const second = track.children[1]?.getBoundingClientRect();
    if (!first || !second || track.scrollWidth <= track.clientWidth) return;
    const atEnd = track.scrollLeft >= track.scrollWidth - track.clientWidth - 2;
    const step = second.left - first.left;
    const index = atEnd ? displayPlans.length - 1 : Math.round(track.scrollLeft / step);
    setActivePlan(Math.max(0, Math.min(index, displayPlans.length - 1)));
  }
  const pad = (value: number) => String(value).padStart(2, "0");
  return (
    <>
      <div
        className={`plan-grid${mobileCarousel ? " plan-grid-mobile" : ""}`}
        role={mobileCarousel ? "region" : undefined}
        aria-label={mobileCarousel ? "Тарифы VPS" : undefined}
        tabIndex={mobileCarousel ? 0 : undefined}
        onScroll={mobileCarousel ? updateActivePlan : undefined}
      >
        {displayPlans.map((plan) => (
          <article
            className={`plan-card ${plan.popular ? "featured" : ""}`}
            key={plan.id}
          >
            {plan.popular && (
              <span className="plan-recommendation">
                Для большинства проектов
              </span>
            )}
            <Server size={23} strokeWidth={1.5} />
            <h3>{plan.name}</h3>
            <p className="plan-description">{plan.description}</p>
            <p className="plan-price">
              {money(plan.price)}
              <span> / мес.</span>
            </p>
            <div className="plan-specs">
              <p>
                <strong>{plan.cpu} vCPU</strong>
                <span>процессор</span>
              </p>
              <p>
                <strong>{plan.ram} ГБ</strong>
                <span>оперативная память</span>
              </p>
              <p>
                <strong>{plan.disk} ГБ NVMe</strong>
                <span>диск</span>
              </p>
            </div>
            {onSelect ? (
              <button
                className={`button ${plan.popular ? "button-accent" : "button-outline"}`}
                onClick={() => onSelect(plan.id)}
              >
                выбрать сервер
              </button>
            ) : (
              <Link
                className={`button ${plan.popular ? "button-accent" : "button-outline"}`}
                href={`/register?plan=${plan.id}`}
              >
                выбрать сервер
              </Link>
            )}
          </article>
        ))}
      </div>
      {mobileCarousel && (
        <div className="plan-scroll-dots" aria-hidden="true">
          <span>{pad(activePlan + 1)} / {pad(displayPlans.length)}</span>
          <span className="plan-scroll-track">
            {displayPlans.map(({ id }, index) => (
              <i key={id} className={activePlan === index ? "is-active" : undefined} />
            ))}
          </span>
          {activePlan < displayPlans.length - 1 && <span className="plan-scroll-hint">листайте →</span>}
        </div>
      )}
    </>
  );
}

export function VpsCatalog({
  onSelect,
  availableLocations,
  featuredPlans,
  liveCatalog,
}: {
  onSelect?: (id: string) => void;
  availableLocations?: Array<{ id: string; label: string }>;
  featuredPlans?: PublicVpsPlan[];
  liveCatalog?: boolean;
}) {
  const locationOptions = availableLocations?.length
    ? availableLocations
    : locations.map((label) => ({ id: label, label }));
  const [location, setLocation] = useState(locationOptions[0]?.label || locations[0]);
  return (
    <>
      <div className="catalog-toolbar">
        <div className="segmented" aria-label="Доступное размещение">
          {locationOptions.map((item) => (
            <button
              key={item.id}
              aria-pressed={item.label === location}
              className={item.label === location ? "selected" : ""}
              onClick={() => setLocation(item.label)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <span className="mono catalog-note">
          <SlidersHorizontal size={15} /> Фиксированные конфигурации
        </span>
      </div>
      <PlanCards mobileCarousel onSelect={onSelect} customPlans={featuredPlans} />
      <div className="catalog-bottom">
        <span>
          <Check size={16} /> Linux на выбор
        </span>
        <span>
          <Check size={16} /> Доступ по SSH
        </span>
        <span>
          <Check size={16} /> Управление в кабинете
        </span>
        <span>
          {liveCatalog ? "Актуальные тарифы" : "Предварительные цены"} · {location}
        </span>
      </div>
    </>
  );
}

export function DomainSearch({
  onSelect,
  compact = false,
  featuredZones,
}: {
  onSelect?: (domain: string) => void;
  compact?: boolean;
  featuredZones?: Array<{ zone: string; registration: number; renewal: number }>;
}) {
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<ReturnType<typeof domainCandidates>>([]);
  const [match, setMatch] = useState<DomainSearchResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const displayZones = featuredZones?.length ? featuredZones : zones;
  async function search(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError("");
    setMatch(null);
    const names = domainCandidates(query);
    setCandidates(names);
    if (!names.length) {
      setError("Введите имя, например my-project, или полный домен, например my-project.shop.");
      return;
    }
    setBusy(true);
    try {
      setMatch(await api("/api/domains/check", { query }));
    } catch (error) {
      setError(error instanceof Error && error.message.startsWith("Слишком много")
        ? error.message
        : "Не удалось проверить домены. Попробуйте ещё раз.");
    } finally {
      setBusy(false);
    }
  }
  function selectDomain(name: string) {
    const className = "button button-small button-outline";
    return onSelect ? (
      <button className={className} type="button" onClick={() => onSelect(name)}>
        выбрать
      </button>
    ) : (
      <Link className={className} href="/register?next=/dashboard/domains">
        выбрать
      </Link>
    );
  }
  function zonePrice(zone: string) {
    const live = match?.prices?.[zone];
    if (live) return live;
    const fallback = zones.find((item) => item.zone === zone);
    return fallback
      ? { registration: fallback.registration, renewal: fallback.renewal, orderable: true }
      : undefined;
  }
  function renderDomain({ name, zone, status }: DomainMatch) {
    const price = zonePrice(zone);
    return (
      <div className="domain-result" key={name}>
        <Globe2 size={20} />
        <strong>{name}</strong>
        <span className={`domain-unknown${status === "available" ? " domain-available" : ""}`}>
          {availabilityLabels[status]}
        </span>
        {price && status !== "unsupported" && (
          <div>
            <b>{money(price.registration)}</b>
            <small>продление {money(price.renewal)}/год</small>
          </div>
        )}
        {status === "available" && (price?.orderable ? selectDomain(name) : <div><small>Пока только проверка</small></div>)}
      </div>
    );
  }
  return (
    <div className={`domain-search ${compact ? "compact" : ""}`}>
      <form onSubmit={search} className="domain-search-form">
        <Search size={22} aria-hidden="true" />
        <label
          className="sr-only"
          htmlFor={compact ? "domain-compact" : "domain-name"}
        >
          Имя домена
        </label>
        <input
          id={compact ? "domain-compact" : "domain-name"}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Имя или домен, например my-project.shop"
          maxLength={264}
          readOnly={busy}
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          required
        />
        <button className="button button-accent" type="submit" disabled={busy}>
          {busy ? "проверяем…" : "подобрать домен"}
        </button>
      </form>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      {!candidates.length && (
        <div className="domain-zone-list">
          {displayZones.map((item) => (
            <span key={item.zone}>
              <b>.{item.zone}</b>
              <span>от {money(item.registration)}/год</span>
            </span>
          ))}
        </div>
      )}
      <div aria-live="polite" aria-busy={busy}>
        {busy ? (
          <p className="domain-results domain-search-progress">Проверяем доступность доменов…</p>
        ) : candidates.length > 0 && (
          <>
            <div className="domain-results">
              {(match?.results ?? candidates.map((item): DomainMatch => ({ ...item, status: "unavailable" }))).map(renderDomain)}
            </div>
            {!!match?.recommendations.length && (
              <section className="domain-recommendations">
                <h3>Свободные похожие домены</h3>
                <div className="domain-recommendation-grid">
                  {match.recommendations.map(({ name, zone }) => {
                    const price = zonePrice(zone);
                    return (
                      <article className="domain-recommendation" key={name}>
                        <div className="domain-recommendation-status">
                          <Check size={14} aria-hidden="true" /> Свободен
                        </div>
                        <strong>{name}</strong>
                        <div className="domain-recommendation-footer">
                          {price ? (
                            <>
                              <div>
                                <b>{money(price.registration)}</b>
                                <small>продление {money(price.renewal)}/год</small>
                              </div>
                              {price.orderable ? selectDomain(name) : <small>Пока только проверка</small>}
                            </>
                          ) : <small>Пока только проверка</small>}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
