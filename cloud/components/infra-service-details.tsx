"use client";
import { useState, type FormEvent } from "react";
import {
  KeyRound,
  Link2,
  Mail,
  Plus,
  Power,
  RotateCw,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { api, SelectField } from "./ui";
import type { Service } from "@cloud/lib/catalog";

type TargetRef = { id: string; kind: string; name: string; address: string };

export function DomainMailEditor({
  serviceId,
  domainName,
  onError,
}: {
  serviceId: string;
  domainName: string;
  onError: (msg: string) => void;
}) {
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mailboxes, setMailboxes] = useState<
    Array<{ mailbox: string; fqdn: string; owner_full_name?: string; comment?: string }>
  >([]);
  const [mailbox, setMailbox] = useState("");
  const [password, setPassword] = useState("");

  async function refreshMailboxes() {
    setBusy(true);
    try {
      const res = await api(`/api/services/${serviceId}/mail`);
      setMailboxes(Array.isArray(res.mailboxes) ? res.mailboxes : []);
      setLoaded(true);
    } catch (err) {
      onError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function createBox(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    onError("");
    try {
      await api(`/api/services/${serviceId}/mail`, { mailbox, password });
      setMailbox("");
      setPassword("");
      await refreshMailboxes();
    } catch (err) {
      onError((err as Error).message);
      setBusy(false);
    }
  }

  async function deleteBox(name: string) {
    setBusy(true);
    onError("");
    try {
      await api(
        `/api/services/${serviceId}/mail?mailbox=${encodeURIComponent(name)}`,
        undefined,
        "DELETE",
      );
      await refreshMailboxes();
    } catch (err) {
      onError((err as Error).message);
      setBusy(false);
    }
  }

  if (!loaded) {
    return (
      <button
        type="button"
        className="button button-small button-outline full"
        disabled={busy}
        onClick={refreshMailboxes}
      >
        <Mail size={14} /> Почтовые ящики (@{domainName})
      </button>
    );
  }

  return (
    <div className="dns-editor">
      <div className="credentials-head">
        <strong>Корпоративная почта (@{domainName})</strong>
      </div>
      {mailboxes.length > 0 ? (
        <div className="dns-record-list">
          {mailboxes.map((m) => (
            <div className="dns-record-row" key={m.mailbox}>
              <div>
                <strong className="mono">
                  {m.mailbox}@{m.fqdn}
                </strong>
                {m.comment && <small className="muted">{m.comment}</small>}
              </div>
              <button
                type="button"
                className="icon-button"
                disabled={busy}
                aria-label={`Удалить ${m.mailbox}`}
                onClick={() => deleteBox(m.mailbox)}
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="small muted">Почтовых ящиков пока нет.</p>
      )}
      <form className="dns-add-form" onSubmit={createBox}>
        <div className="form-two">
          <label className="field">
            Ящик (до @)
            <input
              value={mailbox}
              onChange={(e) => setMailbox(e.target.value)}
              placeholder="info"
              required
            />
          </label>
          <label className="field">
            Пароль (мин. 8)
            <input
              type="password"
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
        </div>
        <button
          type="submit"
          className="button button-small button-outline full"
          disabled={busy}
        >
          <Plus size={14} /> Создать ящик
        </button>
      </form>
    </div>
  );
}

export function InfraServiceControls({
  service,
  liveData,
  busy,
  onAction,
  onReload,
  onError,
}: {
  service: Service;
  liveData: Record<string, unknown> | null;
  busy: boolean;
  onAction: (action: string, extra?: Record<string, unknown>) => Promise<void>;
  onReload: () => Promise<void>;
  onError: (msg: string) => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [creds, setCreds] = useState<Record<string, unknown> | null>(null);
  const [targetId, setTargetId] = useState("");
  const [dbNewName, setDbNewName] = useState("");
  const [s3Subdomain, setS3Subdomain] = useState("");
  const [fwCidr, setFwCidr] = useState("0.0.0.0/0");
  const [fwPort, setFwPort] = useState("443");
  const [fwProtocol, setFwProtocol] = useState<"tcp" | "udp" | "icmp">("tcp");

  const targets = Array.isArray(liveData?.targets)
    ? (liveData.targets as TargetRef[])
    : [];

  async function loadCredentials() {
    try {
      const data = await api(`/api/services/${service.id}/credentials`, {});
      setCreds(data);
    } catch (err) {
      onError((err as Error).message);
    }
  }

  return (
    <div className="vps-extra-tools">
      <dl>
        <div>
          <dt>Конфигурация</dt>
          <dd>{service.details.split("|")[0]}</dd>
        </div>
        <div>
          <dt>Размещение</dt>
          <dd>{service.details.split("|")[1] || "—"}</dd>
        </div>
        {service.address && (
          <div>
            <dt>Адрес / Endpoint</dt>
            <dd className="mono">{service.address}</dd>
          </div>
        )}
      </dl>

      {["database", "s3", "k8s"].includes(service.kind) && (
        <div className="credentials-box">
          <div className="credentials-head">
            <strong>
              {service.kind === "s3"
                ? "Ключи доступа S3"
                : service.kind === "k8s"
                  ? "Kubeconfig"
                  : "Доступ к БД"}
            </strong>
            <button
              type="button"
              className="button button-small button-outline"
              disabled={busy}
              onClick={loadCredentials}
            >
              <KeyRound size={13} />
              {creds ? "Обновить" : "Показать"}
            </button>
          </div>
          {creds && (
            <div className="credentials-values mono">
              {service.kind === "database" && (
                <>
                  <div>
                    <span>Логин:</span> <strong>{String(creds.dbLogin || "—")}</strong>
                  </div>
                  <div>
                    <span>Пароль:</span>{" "}
                    <strong>{String(creds.dbPassword || "—")}</strong>
                  </div>
                </>
              )}
              {service.kind === "s3" && (
                <>
                  <div>
                    <span>Endpoint:</span>{" "}
                    <strong>{String(creds.s3Hostname || service.address)}</strong>
                  </div>
                  <div>
                    <span>Access Key:</span>{" "}
                    <strong>{String(creds.s3AccessKey || "—")}</strong>
                  </div>
                  <div>
                    <span>Secret Key:</span>{" "}
                    <strong>{String(creds.s3SecretKey || "—")}</strong>
                  </div>
                </>
              )}
              {service.kind === "k8s" && (
                <textarea
                  readOnly
                  rows={5}
                  value={String(creds.kubeconfig || "Kubeconfig ещё не готов")}
                />
              )}
            </div>
          )}
        </div>
      )}

      {service.kind === "database" && (
        <>
          <div className="server-actions">
            <button
              type="button"
              className="button button-outline"
              disabled={busy}
              onClick={() =>
                onAction(service.status === "running" ? "stop" : "start")
              }
            >
              <Power size={16} />
              {service.status === "running" ? "Остановить" : "Запустить"}
            </button>
            <button
              type="button"
              className="button button-outline"
              disabled={busy || service.status !== "running"}
              onClick={() => onAction("restart")}
            >
              <RotateCw size={16} />
              Перезагрузить
            </button>
          </div>
          <form
            className="dns-add-form"
            onSubmit={async (e) => {
              e.preventDefault();
              await onAction("add_database", { name: dbNewName });
              setDbNewName("");
              await onReload();
            }}
          >
            <label className="field">
              Создать базу в кластере
              <input
                value={dbNewName}
                onChange={(e) => setDbNewName(e.target.value)}
                placeholder="analytics_db"
                required
              />
            </label>
            <button
              type="submit"
              className="button button-small button-outline"
              disabled={busy}
            >
              <Plus size={14} /> Добавить базу
            </button>
          </form>
        </>
      )}

      {service.kind === "s3" && (
        <>
          <div className="credentials-buttons">
            <button
              type="button"
              className="button button-small button-outline"
              disabled={busy}
              onClick={() =>
                onAction("set_visibility", { bucketType: "public" })
              }
            >
              Сделать публичным
            </button>
            <button
              type="button"
              className="button button-small button-outline"
              disabled={busy}
              onClick={() =>
                onAction("set_visibility", { bucketType: "private" })
              }
            >
              Сделать приватным
            </button>
          </div>
          <form
            className="dns-add-form"
            onSubmit={async (e) => {
              e.preventDefault();
              await onAction("add_subdomain", {
                subdomain: s3Subdomain,
                issueSsl: true,
              });
              setS3Subdomain("");
            }}
          >
            <label className="field">
              Кастомный поддомен (с SSL)
              <input
                value={s3Subdomain}
                onChange={(e) => setS3Subdomain(e.target.value)}
                placeholder="files.example.ru"
                required
              />
            </label>
            <button
              type="submit"
              className="button button-small button-outline"
              disabled={busy}
            >
              Привязать поддомен
            </button>
          </form>
        </>
      )}

      {service.kind === "k8s" &&
        Array.isArray(liveData?.nodeGroups) &&
        (liveData.nodeGroups as Array<{ id: number; name: string; node_count: number }>).map(
          (g) => (
            <div className="person-row" key={g.id}>
              <div>
                <strong>Группа {g.name}</strong>
                <span className="small muted">Нод: {g.node_count}</span>
              </div>
              <div className="credentials-buttons">
                <button
                  type="button"
                  className="button button-small button-outline"
                  disabled={busy || g.node_count <= 1}
                  onClick={() => onAction("scale", { groupId: g.id, delta: -1 })}
                >
                  −1 нода
                </button>
                <button
                  type="button"
                  className="button button-small button-outline"
                  disabled={busy}
                  onClick={() => onAction("scale", { groupId: g.id, delta: 1 })}
                >
                  +1 нода
                </button>
              </div>
            </div>
          ),
        )}

      {service.kind === "cdn" && (
        <div className="credentials-buttons">
          <button
            type="button"
            className="button button-small button-outline"
            disabled={busy}
            onClick={() => onAction("clear_cache")}
          >
            Очистить кеш
          </button>
          <button
            type="button"
            className="button button-small button-outline"
            disabled={busy}
            onClick={() =>
              onAction(service.status === "stopped" ? "resume" : "suspend")
            }
          >
            {service.status === "stopped" ? "Возобновить" : "Приостановить"}
          </button>
          <button
            type="button"
            className="button button-small button-outline"
            disabled={busy}
            onClick={() => onAction("issue_cert")}
          >
            Выпустить SSL
          </button>
        </div>
      )}

      {service.kind === "firewall" && (
        <>
          <form
            className="dns-add-form"
            onSubmit={async (e) => {
              e.preventDefault();
              await onAction("add_rule", {
                direction: "ingress",
                protocol: fwProtocol,
                port: fwPort,
                cidr: fwCidr,
              });
              await onReload();
            }}
          >
            <div className="form-two">
              <SelectField
                label="Протокол"
                value={fwProtocol}
                onChange={(next) => setFwProtocol(next as typeof fwProtocol)}
                options={[
                  { value: "tcp", label: "TCP" },
                  { value: "udp", label: "UDP" },
                  { value: "icmp", label: "ICMP" },
                ]}
              />
              <label className="field">
                Порт
                <input
                  value={fwPort}
                  onChange={(e) => setFwPort(e.target.value)}
                  placeholder="443"
                />
              </label>
            </div>
            <label className="field">
              CIDR
              <input
                value={fwCidr}
                onChange={(e) => setFwCidr(e.target.value)}
                required
              />
            </label>
            <button
              type="submit"
              className="button button-small button-outline"
              disabled={busy}
            >
              <Plus size={14} /> Добавить ingress-правило
            </button>
          </form>
        </>
      )}

      {["floating_ip", "network_drive", "firewall", "balancer"].includes(
        service.kind,
      ) &&
        targets.length > 0 && (
          <div className="dns-editor">
            <SelectField
              label="Привязка к своему ресурсу"
              value={targetId || targets[0].id}
              onChange={setTargetId}
              options={targets.map((t) => ({
                value: t.id,
                label: t.name,
                meta: t.address || t.kind,
              }))}
            />
            <div className="credentials-buttons">
              <button
                type="button"
                className="button button-small button-outline"
                disabled={busy}
                onClick={() =>
                  onAction(
                    service.kind === "network_drive"
                      ? "mount"
                      : service.kind === "firewall"
                        ? "link"
                        : service.kind === "balancer"
                          ? "add_target"
                          : "bind",
                    { targetServiceId: targetId || targets[0].id },
                  )
                }
              >
                <Link2 size={13} />
                {service.kind === "network_drive" ? "Подключить" : "Привязать"}
              </button>
              {["floating_ip", "network_drive"].includes(service.kind) && (
                <button
                  type="button"
                  className="button button-small button-outline"
                  disabled={busy}
                  onClick={() =>
                    onAction(
                      service.kind === "network_drive" ? "unmount" : "unbind",
                    )
                  }
                >
                  Отвязать
                </button>
              )}
            </div>
          </div>
        )}

      {confirmDelete ? (
        <div className="danger-panel">
          <strong>
            <ShieldAlert size={16} /> Удалить {service.name}?
          </strong>
          <p>Ресурс будет удалён у провайдера без возможности восстановления.</p>
          <div>
            <button
              type="button"
              className="button button-small button-danger"
              disabled={busy}
              onClick={() => onAction("delete", { confirm: true })}
            >
              Удалить навсегда
            </button>
            <button
              type="button"
              className="button button-small button-outline"
              onClick={() => setConfirmDelete(false)}
            >
              Отмена
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="button button-small button-outline"
          disabled={busy}
          onClick={() => setConfirmDelete(true)}
        >
          <Trash2 size={14} /> Удалить ресурс
        </button>
      )}
    </div>
  );
}

