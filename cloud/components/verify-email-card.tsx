"use client";
import { useState } from "react";
import Link from "next/link";
import { Check, LoaderCircle, MailCheck } from "lucide-react";
import { api, Logo } from "./ui";

export function VerifyEmailCard({ token }: { token?: string }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  async function confirm() {
    if (!token || busy) return;
    setBusy(true);
    setError("");
    try {
      await api("/api/auth/verify-email", { token });
      setDone(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-layout">
      <aside className="auth-aside">
        <Logo light />
        <div>
          <p className="eyebrow">безопасность аккаунта</p>
          <h2>
            Один шаг.
            <br />
            И всё
            <br />
            <em>готово.</em>
          </h2>
          <p>
            Подтверждённый email нужен
            <br />
            для защиты ваших проектов и заказов.
          </p>
        </div>
        <span className="mono">kernell cloud</span>
        <div className="auth-orbit" aria-hidden="true" />
      </aside>
      <main id="main" className="auth-main">
        <Link href="/" className="auth-back">
          на главную
        </Link>
        <div className="auth-card">
          <span className="auth-icon">
            {done ? <Check size={24} /> : <MailCheck size={24} />}
          </span>
          <h1>{done ? "Email подтверждён." : "Подтверждение почты."}</h1>
          <p>
            {done
              ? "Адрес подтверждён. Теперь можно перейти в личный кабинет."
              : token
                ? "Нажмите кнопку ниже, чтобы завершить подтверждение вашего email."
                : "Ссылка подтверждения неполная или устарела."}
          </p>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {done ? (
            <Link href="/dashboard/settings" className="button button-accent full">
              перейти в кабинет
            </Link>
          ) : token ? (
            <button
              className="button button-accent full"
              onClick={confirm}
              disabled={busy}
              type="button"
            >
              {busy && <LoaderCircle size={18} className="spin" />}
              подтвердить email
            </button>
          ) : (
            <Link href="/login" className="button button-outline full">
              войти в кабинет
            </Link>
          )}
        </div>
        <span className="auth-foot mono">cloud.kernell.ru</span>
      </main>
    </div>
  );
}

