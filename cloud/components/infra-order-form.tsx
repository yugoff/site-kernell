"use client";
import { useEffect, useState, type FormEvent } from "react";
import { LoaderCircle, Plus, ShieldCheck } from "lucide-react";
import { api, clientUuid, SelectField, type SelectOption } from "./ui";
import { money, type Service } from "@cloud/lib/catalog";

type InfraCategoryChoice =
  | "database"
  | "s3"
  | "k8s"
  | "balancer"
  | "cdn"
  | "router"
  | "network_drive"
  | "floating_ip"
  | "vpc"
  | "firewall";

const OPTIONS: Array<{ id: InfraCategoryChoice; label: string }> = [
  { id: "database", label: "Облачная БД (DBaaS)" },
  { id: "s3", label: "Объектное хранилище S3" },
  { id: "k8s", label: "Managed Kubernetes" },
  { id: "balancer", label: "Балансировщик" },
  { id: "cdn", label: "CDN-ресурс" },
  { id: "network_drive", label: "Сетевой диск" },
  { id: "router", label: "Облачный роутер" },
  { id: "floating_ip", label: "Плавающий IP" },
  { id: "vpc", label: "Приватная сеть VPC (бесплатно)" },
  { id: "firewall", label: "Группа Firewall (бесплатно)" },
];

const API_CATEGORY_MAP: Partial<Record<InfraCategoryChoice, string>> = {
  database: "databases",
  s3: "s3",
  k8s: "k8s",
  balancer: "balancers",
  cdn: "cdn",
  router: "routers",
  network_drive: "network_drives",
};

type GenericPreset = Record<string, unknown> & {
  id: number;
  description?: string;
  description_short?: string;
  retailPrice: number;
  type?: string;
  location?: string;
  cpu?: number;
  ram?: number;
  min?: number;
  max?: number;
  step?: number;
};

function dbFamily(value: string): string {
  return value.trim().toLowerCase().replace(/[0-9_]+$/, "");
}

function formatPresetOption(
  kind: InfraCategoryChoice,
  preset: GenericPreset,
): SelectOption {
  if (kind === "network_drive") {
    const unit = String(preset.type || "nvme").toUpperCase();
    return {
      value: String(preset.id),
      label: `${preset.min ?? 10}–${preset.max ?? 1000} ГБ ${unit}`,
      badge: `${money(preset.retailPrice)}/ГБ`,
    };
  }
  if (kind === "router" && !preset.description_short) {
    const ramGb = Math.max(1, Math.round(Number(preset.ram || 1024) / 1024));
    return {
      value: String(preset.id),
      label: `${preset.cpu ?? 1} vCPU · ${ramGb} ГБ`,
      meta: preset.location || undefined,
      badge: money(preset.retailPrice),
    };
  }
  const base =
    preset.description_short || preset.description || `Тариф #${preset.id}`;
  return {
    value: String(preset.id),
    label: base,
    meta:
      preset.location && !base.includes(preset.location)
        ? preset.location
        : undefined,
    badge: money(preset.retailPrice),
  };
}

export function InfraOrderForm({
  s3Buckets,
  done,
}: {
  s3Buckets: Service[];
  done: (instantCreated: boolean) => Promise<void>;
}) {
  const [kind, setKind] = useState<InfraCategoryChoice>("database");
  const [name, setName] = useState("app-infra-1");
  const [catalog, setCatalog] = useState<Record<string, unknown> | null>(null);
  const [presetId, setPresetId] = useState<number>(0);

  const [dbType, setDbType] = useState("postgres16");
  const [bucketType, setBucketType] = useState<"private" | "public">("private");
  const [k8sVersion, setK8sVersion] = useState("1.30");
  const [networkDriver, setNetworkDriver] = useState("cilium");
  const [workerCount, setWorkerCount] = useState(1);
  const [balancerAlgo, setBalancerAlgo] = useState<"roundrobin" | "leastconn">("roundrobin");
  const [balancerProto, setBalancerProto] = useState<"http" | "http2" | "https" | "tcp">("http");
  const [balancerPort, setBalancerPort] = useState(80);
  const [driveSizeGb, setDriveSizeGb] = useState(10);
  const [storageServiceId, setStorageServiceId] = useState(s3Buckets[0]?.id || "");
  const [originHost, setOriginHost] = useState("");
  const [vpcLocation, setVpcLocation] = useState("ru-1");
  const [subnetV4, setSubnetV4] = useState("10.0.0.0/24");
  const [availabilityZone, setAvailabilityZone] = useState("msk-1");
  const [isDdosGuard, setIsDdosGuard] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [requestKey, setRequestKey] = useState(() => clientUuid());

  useEffect(() => {
    const apiCat = API_CATEGORY_MAP[kind];
    setError("");
    setCatalog(null);
    setRequestKey(clientUuid());
    if (!apiCat) return;
    let active = true;
    void api(`/api/catalog?category=${apiCat}`)
      .then((data) => {
        if (!active || !data) return;
        setCatalog(data);
        const presets = Array.isArray(data.presets)
          ? (data.presets as GenericPreset[])
          : [];
        if (kind === "database" && Array.isArray(data.types) && data.types[0]) {
          const types = data.types as Array<{ type: string }>;
          const preferred =
            types.find((t) => t.type === "postgres16") ??
            types.find((t) => t.type.startsWith("postgres")) ??
            types[0];
          const firstType = String(preferred.type);
          setDbType(firstType);
          const fam = dbFamily(firstType);
          const match =
            presets.find(
              (p) => !p.type || dbFamily(String(p.type)) === fam,
            ) ?? presets[0];
          if (match) setPresetId(match.id);
        } else if (presets[0]) {
          setPresetId(presets[0].id);
          if (kind === "network_drive" && presets[0].min) {
            setDriveSizeGb(Number(presets[0].min));
          }
        }
        if (kind === "k8s") {
          const versions = Array.isArray(data.versions) ? (data.versions as string[]) : [];
          const drivers = Array.isArray(data.networkDrivers)
            ? (data.networkDrivers as string[])
            : [];
          if (versions[0]) setK8sVersion(versions[0]);
          if (drivers[0]) setNetworkDriver(drivers[0]);
        }
      })
      .catch(() => null);
    return () => {
      active = false;
    };
  }, [kind]);

  const rawPresets = Array.isArray(catalog?.presets)
    ? (catalog.presets as GenericPreset[])
    : [];
  const filteredPresets =
    kind === "database"
      ? rawPresets.filter(
          (p) => !p.type || dbFamily(String(p.type)) === dbFamily(dbType),
        )
      : rawPresets;
  const activePreset =
    filteredPresets.find((p) => p.id === presetId) ?? filteredPresets[0];

  const isFreeResource = kind === "vpc" || kind === "firewall";
  const estimatedPrice = isFreeResource
    ? 0
    : kind === "floating_ip"
      ? isDdosGuard
        ? 300
        : 180
      : kind === "network_drive" && activePreset
        ? Math.ceil(activePreset.retailPrice * driveSizeGb)
        : kind === "k8s" && activePreset
          ? activePreset.retailPrice * (1 + workerCount)
          : activePreset?.retailPrice;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (isFreeResource) {
        await api("/api/infra/resources", {
          kind,
          name,
          ...(kind === "vpc" ? { location: vpcLocation, subnetV4 } : {}),
        });
        await done(true);
        return;
      }

      await api("/api/orders", {
        kind,
        name,
        requestKey,
        ...(activePreset ? { presetId: activePreset.id } : {}),
        ...(kind === "database" ? { dbType } : {}),
        ...(kind === "s3" ? { bucketType } : {}),
        ...(kind === "k8s"
          ? {
              k8sVersion,
              networkDriver,
              workerPresetId: activePreset?.id,
              workerCount,
            }
          : {}),
        ...(kind === "balancer"
          ? { algo: balancerAlgo, proto: balancerProto, port: Number(balancerPort) }
          : {}),
        ...(kind === "network_drive" ? { sizeGb: Number(driveSizeGb) } : {}),
        ...(kind === "cdn"
          ? storageServiceId
            ? { storageServiceId }
            : { originHost }
          : {}),
        ...(kind === "floating_ip" ? { availabilityZone, isDdosGuard } : {}),
      });
      await done(false);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form className="purchase-form" onSubmit={submit}>
      <SelectField
        label="Тип сервиса"
        value={kind}
        onChange={(next) => setKind(next as InfraCategoryChoice)}
        options={OPTIONS.map((opt) => ({
          value: opt.id,
          label: opt.label.replace(" (бесплатно)", ""),
          badge: opt.id === "vpc" || opt.id === "firewall" ? "Бесплатно" : undefined,
        }))}
      />

      {kind !== "floating_ip" && (
        <label className="field">
          Название ресурса
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            minLength={2}
            maxLength={48}
          />
        </label>
      )}

      {kind === "database" && Array.isArray(catalog?.types) && (
        <SelectField
          label="Движок СУБД"
          value={dbType}
          onChange={(nextType) => {
            setDbType(nextType);
            const fam = dbFamily(nextType);
            const first =
              rawPresets.find(
                (p) => !p.type || dbFamily(String(p.type)) === fam,
              ) ?? rawPresets[0];
            if (first) setPresetId(first.id);
          }}
          options={(
            catalog.types as Array<{
              type: string;
              name: string;
              version: string;
            }>
          ).map((t) => ({
            value: t.type,
            label: `${t.name} ${t.version}`.trim(),
            meta: t.type,
          }))}
        />
      )}

      {kind === "s3" && (
        <SelectField
          label="Доступ к бакету"
          value={bucketType}
          onChange={(next) =>
            setBucketType(next === "public" ? "public" : "private")
          }
          options={[
            { value: "private", label: "Приватный", meta: "Доступ только по ключам S3" },
            { value: "public", label: "Публичный", meta: "Открытый доступ на чтение" },
          ]}
        />
      )}

      {kind === "k8s" && (
        <>
          <div className="form-two">
            <SelectField
              label="Версия Kubernetes"
              value={k8sVersion}
              onChange={setK8sVersion}
              options={(
                (catalog?.versions as string[] | undefined) ?? ["1.30"]
              ).map((v) => ({ value: v, label: v }))}
            />
            <SelectField
              label="CNI-драйвер"
              value={networkDriver}
              onChange={setNetworkDriver}
              options={(
                (catalog?.networkDrivers as string[] | undefined) ?? ["cilium"]
              ).map((d) => ({ value: d, label: d }))}
            />
          </div>
          <label className="field">
            Количество worker-нод
            <input
              type="number"
              min={1}
              max={20}
              value={workerCount}
              onChange={(e) => setWorkerCount(Number(e.target.value))}
              required
            />
          </label>
        </>
      )}

      {kind === "balancer" && (
        <>
          <SelectField
            label="Алгоритм балансировки"
            value={balancerAlgo}
            onChange={(next) =>
              setBalancerAlgo(next === "leastconn" ? "leastconn" : "roundrobin")
            }
            options={[
              { value: "roundrobin", label: "Round Robin" },
              { value: "leastconn", label: "Least Connections" },
            ]}
          />
          <div className="form-two">
            <SelectField
              label="Протокол"
              value={balancerProto}
              onChange={(next) =>
                setBalancerProto(next as typeof balancerProto)
              }
              options={[
                { value: "http", label: "HTTP" },
                { value: "http2", label: "HTTP/2" },
                { value: "https", label: "HTTPS" },
                { value: "tcp", label: "TCP" },
              ]}
            />
            <label className="field">
              Порт
              <input
                type="number"
                min={1}
                max={65535}
                value={balancerPort}
                onChange={(e) => setBalancerPort(Number(e.target.value))}
              />
            </label>
          </div>
        </>
      )}

      {kind === "network_drive" && (
        <label className="field">
          Объём диска, ГБ
          <input
            type="number"
            min={Number(activePreset?.min || 10)}
            max={Number(activePreset?.max || 10000)}
            step={Number(activePreset?.step || 10)}
            value={driveSizeGb}
            onChange={(e) => setDriveSizeGb(Number(e.target.value))}
            required
          />
        </label>
      )}

      {kind === "cdn" && (
        <>
          {s3Buckets.length > 0 && (
            <SelectField
              label="Источник S3 (или укажите сервер ниже)"
              value={storageServiceId}
              onChange={setStorageServiceId}
              options={[
                { value: "", label: "Внешний origin-сервер" },
                ...s3Buckets.map((b) => ({
                  value: b.id,
                  label: b.name,
                  meta: b.address,
                })),
              ]}
            />
          )}
          {!storageServiceId && (
            <label className="field">
              Origin домен или IP
              <input
                value={originHost}
                onChange={(e) => setOriginHost(e.target.value)}
                placeholder="origin.example.ru"
                required
              />
            </label>
          )}
        </>
      )}

      {kind === "floating_ip" && (
        <>
          <SelectField
            label="Зона доступности"
            value={availabilityZone}
            onChange={setAvailabilityZone}
            options={["msk-1", "spb-1", "spb-3", "ams-1", "fra-1", "ala-1"].map(
              (z) => ({ value: z, label: z }),
            )}
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
      )}

      {kind === "vpc" && (
        <div className="form-two">
          <SelectField
            label="Локация"
            value={vpcLocation}
            onChange={setVpcLocation}
            options={[
              { value: "ru-1", label: "Москва (ru-1)" },
              { value: "ru-2", label: "Санкт-Петербург (ru-2)" },
              { value: "pl-1", label: "Польша (pl-1)" },
              { value: "nl-1", label: "Нидерланды (nl-1)" },
            ]}
          />
          <label className="field">
            Подсеть CIDR (RFC1918)
            <input
              value={subnetV4}
              onChange={(e) => setSubnetV4(e.target.value)}
              placeholder="10.0.0.0/24"
              required
            />
          </label>
        </div>
      )}

      {API_CATEGORY_MAP[kind] &&
        (filteredPresets.length > 0 ? (
          <SelectField
            label="Тариф"
            value={String(activePreset?.id ?? "")}
            onChange={(next) => setPresetId(Number(next))}
            options={filteredPresets.map((p) => formatPresetOption(kind, p))}
          />
        ) : (
          <label className="field">
            Тариф
            <input
              readOnly
              value="Синхронизируйте каталог с Timeweb (нужен TIMEWEB_TOKEN)"
            />
          </label>
        ))}

      <div className="order-summary">
        <span>{isFreeResource ? "Стоимость" : "Предварительно к оплате"}</span>
        <strong>
          {estimatedPrice !== undefined ? money(estimatedPrice) : "—"}
          {!isFreeResource && <small> / мес.</small>}
        </strong>
      </div>

      {!isFreeResource && (
        <p className="secure-note">
          <ShieldCheck size={17} /> Заказ сохранится в разделе «Заказы» для оплаты
          с баланса.
        </p>
      )}

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <button
        className="button button-accent full"
        type="submit"
        disabled={
          busy ||
          Boolean(API_CATEGORY_MAP[kind] && !activePreset)
        }
      >
        {busy && <LoaderCircle size={18} className="spin" />}
        <Plus size={16} />
        {isFreeResource ? "Создать сейчас" : "Сохранить заказ"}
      </button>
    </form>
  );
}

