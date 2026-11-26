"use client";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { LoaderCircle, ShieldCheck } from "lucide-react";
import { api, clientUuid, SelectField } from "./ui";
import {
  locations as fallbackLocations,
  money,
  operatingSystems as fallbackOs,
  plans as fallbackPlans,
  zones as fallbackZones,
  type DomainPersonSummary,
  type SshKeySummary,
} from "@cloud/lib/catalog";

type LivePreset = {
  id: number;
  slug?: string;
  name?: string;
  location: string;
  cpu: number;
  ram: number;
  disk: number;
  disk_type: string;
  bandwidth: number;
  description_short: string;
  retailPrice: number;
};

type LiveOs = {
  id: number;
  family: string;
  name: string;
  version: string | null;
};

type LiveZone = {
  zone: string;
  asciiZone: string;
  registration: number;
  renewal: number;
  transfer: number;
  whoisPrivacyAvailable: boolean;
  whoisPrivacyPrice: number;
  allowedPeriods: string[];
};

const LOCATION_LABELS: Record<string, string> = {
  "ru-1": "Санкт-Петербург / Москва (ru-1)",
  "ru-2": "Санкт-Петербург-2 (ru-2)",
  "ru-3": "Новосибирск (ru-3)",
  "ru-4": "Москва (ru-4)",
  "ru-5": "Санкт-Петербург-3 (ru-5)",
  "pl-1": "Гданьск, Польша (pl-1)",
  "kz-1": "Алматы, Казахстан (kz-1)",
  "nl-1": "Амстердам (nl-1)",
  "de-1": "Франкфурт (de-1)",
  "us-4": "США (us-4)",
};

function sortOsList(items: LiveOs[]): LiveOs[] {
  const priority = ["ubuntu", "debian", "almalinux", "rocky", "centos"];
  return [...items].sort((a, b) => {
    const ia = priority.indexOf(a.name.toLowerCase());
    const ib = priority.indexOf(b.name.toLowerCase());
    if (ia !== -1 && ib !== -1) {
      return ia - ib || String(b.version || "").localeCompare(String(a.version || ""));
    }
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    if (a.family !== b.family) return a.family === "linux" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

export function PurchaseForm({
  kind,
  selection,
  persons = [],
  sshKeys = [],
  demo = false,
  timewebEnabled = false,
  done,
}: {
  kind: "vps" | "domain";
  selection: string;
  persons?: DomainPersonSummary[];
  sshKeys?: SshKeySummary[];
  demo?: boolean;
  timewebEnabled?: boolean;
  done: () => void;
}) {
  const [liveSource, setLiveSource] = useState<string>("fallback");
  const [livePresets, setLivePresets] = useState<LivePreset[]>([]);
  const [liveOs, setLiveOs] = useState<LiveOs[]>([]);
  const [liveLocations, setLiveLocations] = useState<string[]>([]);
  const [liveZones, setLiveZones] = useState<LiveZone[]>([]);

  const [locationCode, setLocationCode] = useState<string>(fallbackLocations[0]);
  const [planId, setPlanId] = useState(
    fallbackPlans.find((plan) => plan.id === selection)?.id || "project",
  );
  const [selectedPresetId, setSelectedPresetId] = useState<number | null>(null);
  const [selectedOsId, setSelectedOsId] = useState<number | null>(null);
  const [fallbackOsName, setFallbackOsName] = useState(fallbackOs[0]);
  const [selectedSshKeyIds, setSelectedSshKeyIds] = useState<string[]>([]);
  const [isDdosGuard, setIsDdosGuard] = useState(false);

  const [name, setName] = useState(
    kind === "domain" ? selection : "my-project",
  );
  const [domainAction, setDomainAction] = useState<
    "register" | "prolong" | "transfer"
  >("register");
  const [period, setPeriod] = useState("P1Y");
  const [personId, setPersonId] = useState(persons[0]?.id || "");
  const [authCode, setAuthCode] = useState("");
  const [whoisPrivacy, setWhoisPrivacy] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [requestKey] = useState(() => clientUuid());

  useEffect(() => {
    let active = true;
    void api(`/api/catalog?category=${kind === "vps" ? "vps" : "domains"}`)
      .then((data) => {
        if (!active || !data) return;
        setLiveSource(String(data.source || "fallback"));
        if (kind === "vps" && data.source !== "fallback") {
          const presets = Array.isArray(data.presets)
            ? (data.presets as LivePreset[])
            : [];
          const rawOsList = Array.isArray(data.operatingSystems)
            ? (data.operatingSystems as LiveOs[])
            : [];
          const osList = sortOsList(rawOsList);
          const locs = Array.isArray(data.locations)
            ? (data.locations as Array<{ location: string }>).map(
                (l) => l.location,
              )
            : [];
          setLivePresets(presets);
          setLiveOs(osList);
          if (locs.length) {
            setLiveLocations(locs);
            setLocationCode(locs[0]);
          }
          const matchingPresets = locs.length
            ? presets.filter((p) => p.location === locs[0])
            : presets;
          const initialPreset = matchingPresets[0] ?? presets[0];
          if (initialPreset) setSelectedPresetId(initialPreset.id);
          if (osList[0]) setSelectedOsId(osList[0].id);
        } else if (kind === "domain" && Array.isArray(data.zones)) {
          setLiveZones(data.zones as LiveZone[]);
        }
      })
      .catch(() => {
        // Fallback catalog remains intact if network lookup fails.
      });
    return () => {
      active = false;
    };
  }, [kind]);

  const useLiveVps = kind === "vps" && liveSource !== "fallback" && livePresets.length > 0;

  const visiblePresets = useMemo(() => {
    if (!useLiveVps) return [];
    const byLoc = livePresets.filter((p) => p.location === locationCode);
    return byLoc.length ? byLoc : livePresets;
  }, [livePresets, locationCode, useLiveVps]);

  useEffect(() => {
    if (!useLiveVps || !visiblePresets.length) return;
    if (!visiblePresets.some((p) => p.id === selectedPresetId)) {
      setSelectedPresetId(visiblePresets[0].id);
    }
  }, [useLiveVps, visiblePresets, selectedPresetId]);

  const selectedLivePreset =
    visiblePresets.find((p) => p.id === selectedPresetId) ?? visiblePresets[0];

  const zoneCatalog: LiveZone[] = liveZones.length
    ? liveZones
    : fallbackZones.map((item) => ({
        zone: item.zone,
        asciiZone: item.zone,
        registration: item.registration,
        renewal: item.renewal,
        transfer: item.renewal,
        whoisPrivacyAvailable: item.zone !== "ru" && item.zone !== "рф",
        whoisPrivacyPrice: 0,
        allowedPeriods:
          item.zone === "ru" || item.zone === "рф"
            ? ["P1Y"]
            : ["P1Y", "P2Y", "P3Y"],
      }));

  const matchedZone = useMemo(() => {
    const clean = name.trim().toLowerCase();
    return [...zoneCatalog]
      .sort((a, b) => b.zone.length - a.zone.length)
      .find((item) => clean.endsWith(`.${item.zone}`));
  }, [name, zoneCatalog]);

  const years = Number(/^P(\d+)Y$/.exec(period)?.[1] || 1);
  const price = useMemo(() => {
    if (kind === "vps") {
      if (useLiveVps) return selectedLivePreset?.retailPrice;
      return fallbackPlans.find((p) => p.id === planId)?.price;
    }
    if (!matchedZone) return undefined;
    if (domainAction === "transfer") return matchedZone.transfer;
    const base =
      domainAction === "prolong"
        ? matchedZone.renewal
        : matchedZone.registration;
    const privacy =
      whoisPrivacy && matchedZone.whoisPrivacyAvailable
        ? matchedZone.whoisPrivacyPrice
        : 0;
    return base * years + privacy * years;
  }, [
    kind,
    useLiveVps,
    selectedLivePreset,
    planId,
    matchedZone,
    domainAction,
    whoisPrivacy,
    years,
  ]);

  function toggleSshKey(id: string) {
    setSelectedSshKeyIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      await api("/api/orders", {
        kind,
        name,
        requestKey,
        ...(kind === "vps"
          ? useLiveVps
            ? {
                presetId: selectedLivePreset?.id,
                osId: selectedOsId,
                location: locationCode,
                isDdosGuard,
                ...(selectedSshKeyIds.length
                  ? { sshKeyIds: selectedSshKeyIds }
                  : {}),
              }
            : {
                plan: planId,
                os: fallbackOsName,
                location: locationCode,
                ...(selectedSshKeyIds.length
                  ? { sshKeyIds: selectedSshKeyIds }
                  : {}),
              }
          : {
              action: domainAction,
              period,
              ...(personId ? { personId } : {}),
              ...(domainAction === "transfer" ? { authCode } : {}),
              whoisPrivacy: Boolean(
                whoisPrivacy && matchedZone?.whoisPrivacyAvailable,
              ),
            }),
      });
      done();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form className="purchase-form" onSubmit={submit}>
      <p className="muted">
        Сохраните заказ, а затем оплатите его с баланса в разделе «Заказы» для
        автоматического запуска.
      </p>

      {kind === "vps" ? (
        <>
          {useLiveVps ? (
            <>
              <SelectField
                label="Локация"
                value={locationCode}
                onChange={setLocationCode}
                options={liveLocations.map((loc) => ({
                  value: loc,
                  label: LOCATION_LABELS[loc] || loc,
                }))}
              />
              <SelectField
                label="Конфигурация"
                value={String(selectedLivePreset?.id ?? "")}
                onChange={(next) => setSelectedPresetId(Number(next))}
                options={visiblePresets.map((p) => ({
                  value: String(p.id),
                  label: p.description_short || `VPS ${p.cpu} vCPU`,
                  meta: `${p.cpu} vCPU · ${Math.max(1, Math.round(p.ram / 1024))} ГБ RAM · ${Math.max(1, Math.round(p.disk / 1024))} ГБ ${p.disk_type.toUpperCase()}`,
                  badge: money(p.retailPrice),
                }))}
              />
              <SelectField
                label="Операционная система"
                value={String(selectedOsId ?? "")}
                onChange={(next) => setSelectedOsId(Number(next))}
                options={liveOs.map((os) => ({
                  value: String(os.id),
                  label: os.name + (os.version ? ` ${os.version}` : ""),
                  meta: os.family === "linux" ? "Linux" : os.family,
                }))}
              />
              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={isDdosGuard}
                  onChange={(e) => setIsDdosGuard(e.target.checked)}
                />
                <span>Защита от DDoS L3/L4</span>
              </label>
            </>
          ) : (
            <>
              <SelectField
                label="Конфигурация"
                value={planId}
                onChange={(next) => setPlanId(next as typeof planId)}
                options={fallbackPlans.map((plan) => ({
                  value: plan.id,
                  label: plan.name,
                  meta: `${plan.cpu} vCPU · ${plan.ram} ГБ · ${plan.disk} ГБ NVMe`,
                  badge: money(plan.price),
                }))}
              />
              <div className="form-two">
                <SelectField
                  label="Операционная система"
                  value={fallbackOsName}
                  onChange={setFallbackOsName}
                  options={fallbackOs.map((os) => ({ value: os, label: os }))}
                />
                <SelectField
                  label="Локация"
                  value={locationCode}
                  onChange={setLocationCode}
                  options={fallbackLocations.map((loc) => ({
                    value: loc,
                    label: loc,
                  }))}
                />
              </div>
            </>
          )}

          {!demo && sshKeys.length > 0 && (
            <div className="ssh-pick-group">
              <span className="small muted">SSH-ключи для входа:</span>
              {sshKeys.map((key) => (
                <label className="checkbox-field" key={key.id}>
                  <input
                    type="checkbox"
                    checked={selectedSshKeyIds.includes(key.id)}
                    onChange={() => toggleSshKey(key.id)}
                  />
                  <span>{key.name}</span>
                </label>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="segmented" aria-label="Тип операции с доменом">
            {[
              { id: "register", label: "Регистрация" },
              { id: "prolong", label: "Продление" },
              { id: "transfer", label: "Трансфер" },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                className={domainAction === item.id ? "selected" : ""}
                onClick={() =>
                  setDomainAction(item.id as "register" | "prolong" | "transfer")
                }
              >
                {item.label}
              </button>
            ))}
          </div>
        </>
      )}

      <label className="field">
        {kind === "vps" ? "Имя сервера" : "Доменное имя"}
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
          placeholder={kind === "domain" ? "my-project.ru" : "my-server"}
          maxLength={kind === "vps" ? 48 : 253}
          minLength={kind === "vps" ? 2 : 3}
          pattern={kind === "vps" ? "[a-zA-Z0-9][a-zA-Z0-9-]{1,47}" : undefined}
          autoCapitalize="none"
          autoCorrect="off"
        />
      </label>

      {kind === "domain" && domainAction !== "transfer" && (
        <div className="form-two">
          <SelectField
            label="Срок"
            value={period}
            onChange={setPeriod}
            options={(matchedZone?.allowedPeriods.length
              ? matchedZone.allowedPeriods
              : ["P1Y"]
            ).map((item) => {
              const y = Number(/^P(\d+)Y$/.exec(item)?.[1] || 1);
              return {
                value: item,
                label: y === 1 ? "1 год" : y < 5 ? `${y} года` : `${y} лет`,
              };
            })}
          />
          {!demo && domainAction === "register" && (
            <SelectField
              label="Администратор домена"
              value={personId}
              onChange={setPersonId}
              options={
                persons.length
                  ? persons.map((p) => ({ value: p.id, label: p.label }))
                  : [{ value: "", label: "Не добавлен (добавьте в Настройках)" }]
              }
            />
          )}
        </div>
      )}

      {kind === "domain" && domainAction === "transfer" && (
        <label className="field">
          Auth-код (EPP)
          <input
            value={authCode}
            onChange={(e) => setAuthCode(e.target.value)}
            placeholder="Код переноса от текущего регистратора"
            required
          />
        </label>
      )}

      {kind === "domain" &&
        domainAction !== "transfer" &&
        matchedZone?.whoisPrivacyAvailable && (
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={whoisPrivacy}
              onChange={(e) => setWhoisPrivacy(e.target.checked)}
            />
            <span>
              Скрыть данные в WHOIS
              {matchedZone.whoisPrivacyPrice > 0
                ? ` (+${money(matchedZone.whoisPrivacyPrice)}/год)`
                : ""}
            </span>
          </label>
        )}

      {kind === "domain" && !demo && timewebEnabled && domainAction === "register" && !persons.length && (
        <p className="small muted">
          Для оплаты регистрации домена потребуется{" "}
          <Link href="/dashboard/settings">профиль администратора домена</Link>.
        </p>
      )}

      <div className="order-summary">
        <span>Итого к оплате с баланса</span>
        <strong>
          {price !== undefined ? money(price) : "Выберите зону"}
          <small>
            {" "}
            /{" "}
            {kind === "vps"
              ? "месяц"
              : domainAction === "transfer"
                ? "перенос"
                : `${years === 1 ? "год" : `${years} г.`}`}
          </small>
        </strong>
        {kind === "domain" && matchedZone && (
          <p>Продление: {money(matchedZone.renewal)} в год</p>
        )}
      </div>

      <p className="secure-note">
        <ShieldCheck size={17} /> Сейчас создаётся черновик — списание произойдёт
        только после нажатия «Оплатить с баланса».
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
