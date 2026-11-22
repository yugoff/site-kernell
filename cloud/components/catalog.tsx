"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Check, Globe2, Search, Server, SlidersHorizontal } from "lucide-react";
import { locations, money, plans, zones } from "@cloud/lib/catalog";

export function PlanCards({ onSelect }: { onSelect?: (id: string) => void }) {
  return (
    <div className="plan-grid">
      {plans.map((plan) => (
        <article
          className={`plan-card ${"popular" in plan ? "featured" : ""}`}
          key={plan.id}
        >
          {"popular" in plan && (
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
              className={`button ${"popular" in plan ? "button-accent" : "button-outline"}`}
              onClick={() => onSelect(plan.id)}
            >
              выбрать сервер
            </button>
          ) : (
            <Link
              className={`button ${"popular" in plan ? "button-accent" : "button-outline"}`}
              href={`/register?plan=${plan.id}`}
            >
              выбрать сервер
            </Link>
          )}
        </article>
      ))}
    </div>
  );
}

export function VpsCatalog({ onSelect }: { onSelect?: (id: string) => void }) {
  const [location, setLocation] = useState(locations[0]);
  return (
    <>
      <div className="catalog-toolbar">
        <div className="segmented" aria-label="Планируемое размещение">
          {locations.map((item) => (
            <button
              key={item}
              aria-pressed={item === location}
              className={item === location ? "selected" : ""}
              onClick={() => setLocation(item)}
            >
              {item}
            </button>
          ))}
        </div>
        <span className="mono catalog-note">
          <SlidersHorizontal size={15} /> Фиксированные конфигурации
        </span>
      </div>
      <PlanCards onSelect={onSelect} />
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
        <span>Предварительные цены · {location}</span>
      </div>
    </>
  );
}

export function DomainSearch({
  onSelect,
  compact = false,
}: {
  onSelect?: (domain: string) => void;
  compact?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [label, setLabel] = useState("");
  const [error, setError] = useState("");
  function search(event: FormEvent) {
    event.preventDefault();
    setError("");
    const name = query
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/\/$/, "");
    const base = name.split(".")[0];
    if (!/^[\p{L}\p{N}](?:[\p{L}\p{N}-]{0,60}[\p{L}\p{N}])?$/u.test(base)) {
      setError("Введите имя из букв, цифр и дефисов, например my-project.");
      return;
    }
    setLabel(base);
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
          placeholder="Имя вашего следующего проекта"
          maxLength={80}
          autoCapitalize="none"
          autoCorrect="off"
          required
        />
        <button className="button button-accent" type="submit">
          подобрать домен
        </button>
      </form>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      {!label && (
        <div className="domain-zone-list">
          {zones.map((item) => (
            <span key={item.zone}>
              <b>.{item.zone}</b>
              <span>от {money(item.registration)}/год</span>
            </span>
          ))}
        </div>
      )}
      {label && (
        <div className="domain-results" aria-live="polite">
          <p className="muted">
            Пример подбора. Свободность доменов ещё не проверена у регистратора.
          </p>
          {zones.map((item) => (
            <div className="domain-result" key={item.zone}>
              <Globe2 size={20} />
              <strong>
                {label}.{item.zone}
              </strong>
              <span className="domain-unknown">Нужна проверка</span>
              <div>
                <b>{money(item.registration)}</b>
                <small>продление {money(item.renewal)}/год</small>
              </div>
              {onSelect ? (
                <button
                  className="button button-small button-outline"
                  onClick={() => onSelect(`${label}.${item.zone}`)}
                >
                  выбрать
                </button>
              ) : (
                <Link
                  className="button button-small button-outline"
                  href="/register?next=/dashboard/domains"
                >
                  выбрать
                </Link>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
