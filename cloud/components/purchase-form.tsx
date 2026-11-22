"use client";
import { useState, type FormEvent } from "react";
import { LoaderCircle, ShieldCheck } from "lucide-react";
import { api } from "./ui";
import {
  locations,
  money,
  operatingSystems,
  plans,
  zones,
} from "@cloud/lib/catalog";

export function PurchaseForm({
  kind,
  selection,
  done,
}: {
  kind: "vps" | "domain";
  selection: string;
  done: () => void;
}) {
  const [planId, setPlanId] = useState(
    plans.find((plan) => plan.id === selection)?.id || "project",
  );
  const [name, setName] = useState(
    kind === "domain" ? selection : "my-project",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [requestKey] = useState(() => crypto.randomUUID());
  const plan = plans.find((plan) => plan.id === planId)!;
  const zone = zones.find((zone) =>
    name.toLowerCase().endsWith(`.${zone.zone}`),
  );
  const price = kind === "vps" ? plan.price : zone?.registration;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      await api("/api/orders", {
        kind,
        name,
        plan: planId,
        os: form.get("os"),
        location: form.get("location"),
        requestKey,
      });
      done();
    } catch (error) {
      setError((error as Error).message);
      setBusy(false);
    }
  }
  return (
    <form className="purchase-form" onSubmit={submit}>
      <p className="muted">
        Сохраните конфигурацию в заказах. Оплата и выдача услуг пока недоступны.
      </p>
      {kind === "vps" && (
        <>
          <label className="field">
            Конфигурация
            <select
              value={planId}
              onChange={(event) =>
                setPlanId(event.target.value as typeof planId)
              }
            >
              {plans.map((plan) => (
                <option value={plan.id} key={plan.id}>
                  {plan.name} · {plan.cpu} vCPU / {plan.ram} ГБ / {plan.disk} ГБ
                  NVMe
                </option>
              ))}
            </select>
          </label>
          <div className="form-two">
            <label className="field">
              Операционная система
              <select name="os">
                {operatingSystems.map((os) => (
                  <option key={os}>{os}</option>
                ))}
              </select>
            </label>
            <label className="field">
              Локация
              <select name="location">
                {locations.map((location) => (
                  <option key={location}>{location}</option>
                ))}
              </select>
            </label>
          </div>
        </>
      )}
      <label className="field">
        {kind === "vps" ? "Имя сервера" : "Доменное имя"}
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
          maxLength={kind === "vps" ? 48 : 253}
          minLength={kind === "vps" ? 2 : 3}
          pattern={kind === "vps" ? "[a-zA-Z0-9][a-zA-Z0-9-]{1,47}" : undefined}
          autoCapitalize="none"
          autoCorrect="off"
        />
      </label>
      {kind === "domain" && (
        <p className="small muted">
          Свободность и возможность регистрации будут проверены перед оплатой.
          Домен будет оформлен на данные покупателя.
        </p>
      )}
      <div className="order-summary">
        <span>Предварительная стоимость</span>
        <strong>
          {price !== undefined ? money(price) : "Выберите зону"}
          <small> / {kind === "vps" ? "месяц" : "первый год"}</small>
        </strong>
        {kind === "domain" && zone && (
          <p>Продление: {money(zone.renewal)} в год</p>
        )}
      </div>
      <p className="secure-note">
        <ShieldCheck size={17} /> Сейчас деньги не списываются.
      </p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button
        className="button button-accent full"
        type="submit"
        disabled={busy || price === undefined}
      >
        {busy && <LoaderCircle size={18} className="spin" />}Сохранить заказ
      </button>
    </form>
  );
}
