"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  Check,
  Copy,
  HardDrive,
  KeyRound,
  LoaderCircle,
  Plus,
  Power,
  RefreshCw,
  RotateCw,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { api, SelectField } from "./ui";
import { DomainMailEditor, InfraServiceControls } from "./infra-service-details";
import {
  dateLabel,
  type Service,
  type SshKeySummary,
} from "@cloud/lib/catalog";

type LiveDnsRecord = {
  id: number;
  type: string;
  fqdn: string;
  ttl: number;
  data: {
    priority?: number;
    subdomain?: string;
    value?: string;
    host?: string;
    port?: number;
    service?: string;
    protocol?: string;
  };
};

type LiveVpsDetails = {
  kind: "vps";
  live: true;
  hasCredentials: boolean;
  status: Service["status"];
  address: string;
  server: {
    id: number;
    cpu: number;
    ramMb: number;
    location: string;
    os: { id: number; name: string; version: string | null };
    isDdosGuard: boolean;
    disks: Array<{
      id: number;
      size: number;
      type: string;
      system_name: string;
      is_system: boolean;
    }>;
  } | null;
  operatingSystems: Array<{
    id: number;
    family: string;
    name: string;
    version: string | null;
  }>;
};

type LiveDomainDetails = {
  kind: "domain";
  live: true;
  fqdn: string;
  domainInfo: {
    domain_status?: string;
    request_status?: string | null;
    paid_till?: string | null;
    expiration?: string | null;
    days_left?: number | null;
  } | null;
  nameservers: string[];
  dnsRecords: LiveDnsRecord[];
};

const statusLabels: Record<Service["status"], string> = {
  running: "Работает",
  active: "Активен",
  stopped: "Остановлен",
  provisioning: "Создаётся",
  reinstalling: "Переустановка",
  error: "Ошибка",
};

export function ServiceStatus({ value }: { value: Service["status"] }) {
  const modifier =
    value === "stopped"
      ? "stopped"
      : value === "provisioning" || value === "reinstalling"
        ? "pending"
        : value === "error"
          ? "error"
          : "";
  return (
    <span className={`service-status ${modifier}`}>
      <i />
      {statusLabels[value] || value}
    </span>
  );
}

export function ServiceDetails({
  service,
  demo,
  timewebEnabled,
  updated,
  onDeleted,
}: {
  service: Service;
  demo: boolean;
  timewebEnabled?: boolean;
  updated: (message: string) => Promise<void>;
  onDeleted?: () => Promise<void>;
}) {
  const canControlLive =
    !demo && Boolean(timewebEnabled) && Boolean(service.twResourceId);
  const controlsEnabled = demo || canControlLive;

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmAction, setConfirmAction] = useState<
    null | "stop" | "reinstall" | "delete"
  >(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [nameservers, setNameservers] = useState(
    service.details.replaceAll("|", "\n"),
  );
  const [liveVps, setLiveVps] = useState<LiveVpsDetails | null>(null);
  const [liveDomain, setLiveDomain] = useState<LiveDomainDetails | null>(null);
  const [liveInfra, setLiveInfra] = useState<Record<string, unknown> | null>(
    null,
  );
  const [credentials, setCredentials] = useState<{
    rootPass: string | null;
    vncPass: string | null;
  } | null>(null);
  const [reinstallOsId, setReinstallOsId] = useState<number>(0);
  const [diskOpen, setDiskOpen] = useState(false);
  const [dnsOpen, setDnsOpen] = useState(false);

  const loadLiveDetails = useCallback(async () => {
    if (!canControlLive) return;
    try {
      const data = await api(`/api/services/${service.id}/details`);
      if (data.live && data.kind === "vps") {
        setLiveVps(data as LiveVpsDetails);
        const osList = (data as LiveVpsDetails).operatingSystems || [];
        if (osList.length) {
          setReinstallOsId(
            (prev) => prev || data.server?.os?.id || osList[0].id,
          );
        }
      } else if (data.live && data.kind === "domain") {
        const domainData = data as LiveDomainDetails;
        setLiveDomain(domainData);
        if (domainData.nameservers?.length) {
          setNameservers(domainData.nameservers.join("\n"));
        }
      } else if (data.live) {
        setLiveInfra(data as Record<string, unknown>);
      }
    } catch {
      // Details panel degrades cleanly to cached fields on transient errors.
    }
  }, [canControlLive, service.id]);

  useEffect(() => {
    void loadLiveDetails();
  }, [loadLiveDetails]);

  async function act(action: string, extra: Record<string, unknown> = {}) {
    setBusy(true);
    setError("");
    try {
      const result = await api(`/api/services/${service.id}`, {
        action,
        ...extra,
      });
      setConfirmAction(null);
      if (result.deleted && onDeleted) {
        await onDeleted();
        return;
      }
      await updated(result.message);
      await loadLiveDetails();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function revealCredentials() {
    setBusy(true);
    setError("");
    try {
      const data = await api(`/api/services/${service.id}/credentials`, {});
      setCredentials({
        rootPass: data.rootPass ?? null,
        vncPass: data.vncPass ?? null,
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function copyText(key: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((cur) => (cur === key ? null : cur)), 2000);
    } catch {
      setError("Не удалось скопировать в буфер обмена.");
    }
  }

  const disks = liveVps?.server?.disks ?? [];
  const address = liveVps?.address || service.address;
  const currentStatus = liveVps?.status || service.status;

  return (
    <div className="service-details">
      <div className="detail-status">
        <ServiceStatus value={currentStatus} />
        <div className="detail-status-actions">
          {demo && <span className="tag">Демонстрационная услуга</span>}
          {canControlLive && (
            <button
              type="button"
              className="button button-small button-outline"
              disabled={busy}
              onClick={() => act("sync")}
            >
              <RefreshCw size={13} />
              Обновить
            </button>
          )}
        </div>
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
                {address || "Назначается…"}
                {address && (
                  <button
                    type="button"
                    className="icon-button"
                    onClick={() => copyText("ip", address)}
                    aria-label="Скопировать IP-адрес"
                  >
                    {copiedKey === "ip" ? (
                      <Check size={16} />
                    ) : (
                      <Copy size={16} />
                    )}
                  </button>
                )}
              </dd>
            </div>
            {disks.length > 0 && (
              <div>
                <dt>Диски</dt>
                <dd>
                  {disks
                    .map(
                      (disk) =>
                        `${disk.system_name}: ${Math.round(disk.size / 1024)} ГБ ${disk.type.toUpperCase()}`,
                    )
                    .join(", ")}
                </dd>
              </div>
            )}
          </dl>

          {canControlLive && (
            <div className="credentials-box">
              <div className="credentials-head">
                <strong>Доступ SSH (root)</strong>
                <div className="credentials-buttons">
                  <button
                    type="button"
                    className="button button-small button-outline"
                    disabled={busy}
                    onClick={revealCredentials}
                  >
                    <KeyRound size={13} />
                    {credentials ? "Обновить пароль" : "Показать пароль"}
                  </button>
                  <button
                    type="button"
                    className="button button-small button-outline"
                    disabled={busy}
                    onClick={() => act("reset_password").then(() => revealCredentials())}
                  >
                    Сбросить
                  </button>
                </div>
              </div>
              {credentials && (
                <div className="credentials-values mono">
                  <div>
                    <span>root:</span>{" "}
                    <strong>
                      {credentials.rootPass || "Ещё генерируется провайдером…"}
                    </strong>
                    {credentials.rootPass && (
                      <button
                        type="button"
                        className="icon-button"
                        onClick={() => copyText("root", credentials.rootPass!)}
                        aria-label="Скопировать root-пароль"
                      >
                        {copiedKey === "root" ? (
                          <Check size={14} />
                        ) : (
                          <Copy size={14} />
                        )}
                      </button>
                    )}
                  </div>
                  {credentials.vncPass && (
                    <div>
                      <span>VNC:</span> <strong>{credentials.vncPass}</strong>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {confirmAction === "stop" ? (
            <div className="confirm-panel">
              <strong>Остановить {service.name}?</strong>
              <p>
                {demo
                  ? "В деморежиме изменится только статус примера."
                  : "Сервер прекратит выполнение процессов. Тарификация диска и IP продолжится до удаления."}
              </p>
              <div>
                <button
                  type="button"
                  className="button button-small button-accent"
                  disabled={busy}
                  onClick={() => act("stop")}
                >
                  Остановить
                </button>
                <button
                  type="button"
                  className="button button-small button-outline"
                  onClick={() => setConfirmAction(null)}
                >
                  Отмена
                </button>
              </div>
            </div>
          ) : (
            <div className="server-actions">
              <button
                type="button"
                className="button button-outline"
                disabled={busy || !controlsEnabled}
                onClick={() =>
                  currentStatus === "running"
                    ? setConfirmAction("stop")
                    : act("start")
                }
              >
                <Power size={17} />
                {currentStatus === "running" ? "Остановить" : "Запустить"}
              </button>
              <button
                type="button"
                className="button button-outline"
                disabled={
                  busy || currentStatus !== "running" || !controlsEnabled
                }
                onClick={() => act("restart")}
              >
                <RotateCw size={17} />
                Перезагрузить
              </button>
            </div>
          )}

          {canControlLive && (
            <div className="vps-extra-tools">
              <div className="credentials-buttons">
                <button
                  type="button"
                  className="button button-small button-outline"
                  disabled={busy}
                  onClick={() => {
                    setDiskOpen(!diskOpen);
                    setConfirmAction(null);
                  }}
                >
                  <HardDrive size={14} />
                  Добавить диск
                </button>
                <button
                  type="button"
                  className="button button-small button-outline"
                  disabled={busy || !(liveVps?.operatingSystems.length)}
                  onClick={() => {
                    setDiskOpen(false);
                    setConfirmAction(
                      confirmAction === "reinstall" ? null : "reinstall",
                    );
                  }}
                >
                  Переустановить ОС
                </button>
                <button
                  type="button"
                  className="button button-small button-outline"
                  disabled={busy}
                  onClick={() => {
                    setDiskOpen(false);
                    setConfirmAction(
                      confirmAction === "delete" ? null : "delete",
                    );
                  }}
                >
                  <Trash2 size={14} />
                  Удалить
                </button>
              </div>

              {diskOpen && (
                <div className="confirm-panel">
                  <strong>Добавить дополнительный NVMe-диск</strong>
                  <p>Выберите объём дополнительного диска (шаг 5 ГБ):</p>
                  <div>
                    {[5120, 10240, 20480, 51200].map((sizeMb) => (
                      <button
                        key={sizeMb}
                        type="button"
                        className="button button-small button-outline"
                        disabled={busy}
                        onClick={() => act("add_disk", { sizeMb }).then(() => setDiskOpen(false))}
                      >
                        +{Math.round(sizeMb / 1024)} ГБ
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {confirmAction === "reinstall" && liveVps && (
                <div className="confirm-panel">
                  <strong>Переустановить ОС на {service.name}?</strong>
                  <p>Все данные на системном диске будут полностью перезаписаны.</p>
                  <SelectField
                    label="Новая ОС"
                    value={String(reinstallOsId || liveVps.operatingSystems[0]?.id || "")}
                    onChange={(next) => setReinstallOsId(Number(next))}
                    options={liveVps.operatingSystems.map((os) => ({
                      value: String(os.id),
                      label: os.name + (os.version ? ` ${os.version}` : ""),
                      meta: os.family,
                    }))}
                  />
                  <div>
                    <button
                      type="button"
                      className="button button-small button-accent"
                      disabled={busy || !reinstallOsId}
                      onClick={() =>
                        act("reinstall", { osId: reinstallOsId, confirm: true })
                      }
                    >
                      Подтвердить переустановку
                    </button>
                    <button
                      type="button"
                      className="button button-small button-outline"
                      onClick={() => setConfirmAction(null)}
                    >
                      Отмена
                    </button>
                  </div>
                </div>
              )}

              {confirmAction === "delete" && (
                <div className="danger-panel">
                  <strong>
                    <ShieldAlert size={16} /> Удалить сервер {service.name}?
                  </strong>
                  <p>
                    Сервер и все диски будут удалены у провайдера без возможности
                    восстановления.
                  </p>
                  <div>
                    <button
                      type="button"
                      className="button button-small button-danger"
                      disabled={busy}
                      onClick={() => act("delete", { confirm: true })}
                    >
                      Удалить навсегда
                    </button>
                    <button
                      type="button"
                      className="button button-small button-outline"
                      onClick={() => setConfirmAction(null)}
                    >
                      Отмена
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      ) : service.kind === "domain" ? (
        <>
          {canControlLive && liveDomain?.domainInfo && (
            <dl>
              <div>
                <dt>Статус у регистратора</dt>
                <dd>{liveDomain.domainInfo.domain_status || "—"}</dd>
              </div>
              {liveDomain.domainInfo.paid_till && (
                <div>
                  <dt>Оплачен до</dt>
                  <dd>{dateLabel(liveDomain.domainInfo.paid_till)}</dd>
                </div>
              )}
            </dl>
          )}
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
              disabled={busy || !controlsEnabled}
            >
              Сохранить NS-серверы
            </button>
          </form>

          {canControlLive && (
            <div className="dns-editor-wrap">
              <button
                type="button"
                className="button button-small button-outline full"
                onClick={() => setDnsOpen(!dnsOpen)}
              >
                {dnsOpen
                  ? "Скрыть редактор DNS-записей"
                  : `Управление DNS-записями (${liveDomain?.dnsRecords.length ?? 0})`}
              </button>
              {dnsOpen && (
                <DomainDnsEditor
                  serviceId={service.id}
                  rootFqdn={service.twResourceId!}
                  records={liveDomain?.dnsRecords ?? []}
                  onChanged={loadLiveDetails}
                  onError={setError}
                />
              )}
              <DomainMailEditor
                serviceId={service.id}
                domainName={service.name}
                onError={setError}
              />
            </div>
          )}
        </>
      ) : canControlLive ? (
        <InfraServiceControls
          service={service}
          liveData={liveInfra}
          busy={busy}
          onAction={act}
          onReload={loadLiveDetails}
          onError={setError}
        />
      ) : null}

      <div className="detail-renewal">
        <div>
          <strong>Автопродление</strong>
          <span>Следующий срок: {dateLabel(service.renewal)}</span>
        </div>
        <button
          role="switch"
          type="button"
          aria-checked={service.autoRenew}
          aria-label="Автопродление"
          className={`switch ${service.autoRenew ? "on" : ""}`}
          disabled={busy || !controlsEnabled}
          onClick={() => act("renewal", { enabled: !service.autoRenew })}
        >
          <span />
        </button>
      </div>

      <p className="small muted">
        {demo
          ? "Все действия выполняются только с примером. Реальные серверы и домены не изменяются."
          : canControlLive
            ? "Команды выполняются напрямую в облачной платформе Timeweb."
            : "Управление станет доступно после запуска провижининга."}
      </p>

      {busy && (
        <p className="secure-note">
          <LoaderCircle className="spin" size={16} />
          Выполняем запрос…
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

function DomainDnsEditor({
  serviceId,
  rootFqdn,
  records,
  onChanged,
  onError,
}: {
  serviceId: string;
  rootFqdn: string;
  records: LiveDnsRecord[];
  onChanged: () => Promise<void>;
  onError: (msg: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [type, setType] = useState<"A" | "AAAA" | "TXT" | "CNAME" | "MX" | "SRV">(
    "A",
  );
  const [subdomain, setSubdomain] = useState("");
  const [value, setValue] = useState("");
  const [priority, setPriority] = useState(10);
  const [ttl, setTtl] = useState(600);
  const [srvService, setSrvService] = useState("_sip");
  const [srvProtocol, setSrvProtocol] = useState("_tcp");
  const [srvPort, setSrvPort] = useState(443);

  async function createRecord(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    onError("");
    try {
      await api(`/api/services/${serviceId}/dns`, {
        type,
        subdomain: subdomain.trim(),
        ttl: Number(ttl),
        ...(type === "SRV"
          ? {
              service: srvService,
              protocol: srvProtocol,
              priority: Number(priority),
              port: Number(srvPort),
              host: value,
            }
          : type === "MX"
            ? { value, priority: Number(priority) }
            : { value }),
      });
      setSubdomain("");
      setValue("");
      await onChanged();
    } catch (err) {
      onError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function removeRecord(record: LiveDnsRecord) {
    setBusy(true);
    onError("");
    try {
      const targetFqdn = record.fqdn || rootFqdn;
      await api(
        `/api/services/${serviceId}/dns?recordId=${record.id}&targetFqdn=${encodeURIComponent(targetFqdn)}`,
        undefined,
        "DELETE",
      );
      await onChanged();
    } catch (err) {
      onError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dns-editor">
      {records.length > 0 ? (
        <div className="dns-record-list">
          {records.map((rec) => {
            const label = rec.data.subdomain
              ? `${rec.data.subdomain}.${rec.fqdn}`
              : rec.fqdn;
            const summary =
              rec.type === "SRV"
                ? `${rec.data.priority ?? 0} ${rec.data.port ?? ""} ${rec.data.host ?? ""}`
                : `${rec.data.priority !== undefined ? `[${rec.data.priority}] ` : ""}${rec.data.value ?? rec.data.host ?? ""}`;
            return (
              <div className="dns-record-row" key={rec.id}>
                <div>
                  <span className="tag">{rec.type}</span>
                  <strong className="mono">{label}</strong>
                  <small className="mono muted">
                    {summary} · TTL {rec.ttl}
                  </small>
                </div>
                <button
                  type="button"
                  className="icon-button"
                  disabled={busy}
                  aria-label={`Удалить запись ${rec.type}`}
                  onClick={() => removeRecord(rec)}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="small muted">Пользовательских DNS-записей пока нет.</p>
      )}

      <form className="dns-add-form" onSubmit={createRecord}>
        <div className="form-two">
          <SelectField
            label="Тип"
            value={type}
            onChange={(next) => setType(next as typeof type)}
            options={["A", "AAAA", "TXT", "CNAME", "MX", "SRV"].map((t) => ({
              value: t,
              label: t,
            }))}
          />
          <label className="field">
            Поддомен (необяз.)
            <input
              value={subdomain}
              onChange={(e) => setSubdomain(e.target.value)}
              placeholder="@ или www"
            />
          </label>
        </div>

        {type === "SRV" && (
          <div className="form-two">
            <label className="field">
              Сервис
              <input
                value={srvService}
                onChange={(e) => setSrvService(e.target.value)}
                required
              />
            </label>
            <SelectField
              label="Протокол"
              value={srvProtocol}
              onChange={setSrvProtocol}
              options={[
                { value: "_tcp", label: "_tcp" },
                { value: "_udp", label: "_udp" },
              ]}
            />
          </div>
        )}

        <label className="field">
          {type === "SRV"
            ? "Целевой хост"
            : type === "MX"
              ? "Почтовый сервер"
              : type === "CNAME"
                ? "Целевой домен"
                : type === "TXT"
                  ? "Значение TXT"
                  : "IP-адрес"}
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={
              type === "A"
                ? "203.0.113.10"
                : type === "AAAA"
                  ? "2001:db8::1"
                  : type === "TXT"
                    ? "v=spf1 ~all"
                    : "target.example.com"
            }
            required
          />
        </label>

        <div className="form-two">
          {(type === "MX" || type === "SRV") && (
            <label className="field">
              Приоритет
              <input
                type="number"
                min={0}
                max={65535}
                value={priority}
                onChange={(e) => setPriority(Number(e.target.value))}
                required
              />
            </label>
          )}
          {type === "SRV" && (
            <label className="field">
              Порт
              <input
                type="number"
                min={1}
                max={65535}
                value={srvPort}
                onChange={(e) => setSrvPort(Number(e.target.value))}
                required
              />
            </label>
          )}
          <label className="field">
            TTL (сек)
            <input
              type="number"
              min={60}
              max={86400}
              value={ttl}
              onChange={(e) => setTtl(Number(e.target.value))}
            />
          </label>
        </div>

        <button
          type="submit"
          className="button button-small button-outline full"
          disabled={busy}
        >
          <Plus size={14} /> Добавить DNS-запись
        </button>
      </form>
    </div>
  );
}

export function SshKeysPanel({
  sshKeys,
  notify,
  saved,
}: {
  sshKeys: SshKeySummary[];
  notify: (message: string) => void;
  saved: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function saveKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const element = event.currentTarget;
    const form = new FormData(element);
    try {
      await api("/api/ssh-keys", {
        name: form.get("name"),
        publicKey: form.get("publicKey"),
      });
      element.reset();
      setOpen(false);
      await saved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteKey(id: string) {
    try {
      await api(`/api/ssh-keys?id=${encodeURIComponent(id)}`, undefined, "DELETE");
      await saved();
    } catch (err) {
      notify((err as Error).message);
    }
  }

  return (
    <section className="panel settings-form">
      <div className="panel-heading-inline">
        <div>
          <h2>SSH-ключи</h2>
          <p className="small muted">
            Публичные ключи для автоматического добавления при создании VPS.
          </p>
        </div>
        <button
          type="button"
          className="button button-small button-outline"
          onClick={() => setOpen(!open)}
        >
          {open ? "Скрыть форму" : "Добавить SSH-ключ"}
        </button>
      </div>

      {sshKeys.length > 0 ? (
        <div className="person-list">
          {sshKeys.map((key) => (
            <div className="person-row" key={key.id}>
              <div>
                <strong>{key.name}</strong>
                <span className="small muted mono">{key.fingerprint}</span>
              </div>
              <button
                type="button"
                className="button button-small button-outline"
                onClick={() => deleteKey(key.id)}
              >
                Удалить
              </button>
            </div>
          ))}
        </div>
      ) : (
        !open && (
          <p className="small muted">
            Пока нет сохранённых SSH-ключей. Вы сможете входить по root-паролю из
            кабинета или добавить свой Ed25519/RSA ключ заранее.
          </p>
        )
      )}

      {open && (
        <form className="person-form" onSubmit={saveKey}>
          <label className="field">
            Название ключа
            <input
              name="name"
              placeholder="MacBook Pro (work)"
              minLength={2}
              maxLength={80}
              required
            />
          </label>
          <label className="field">
            Публичный ключ
            <textarea
              name="publicKey"
              rows={3}
              placeholder="ssh-ed25519 AAAA..."
              required
            />
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button
            className="button button-accent"
            type="submit"
            disabled={busy}
          >
            {busy && <LoaderCircle className="spin" size={16} />}
            Сохранить SSH-ключ
          </button>
        </form>
      )}
    </section>
  );
}

