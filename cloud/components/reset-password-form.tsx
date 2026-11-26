"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Eye, EyeOff, KeyRound, LoaderCircle } from "lucide-react";
import { api, Logo } from "./ui";

export function ResetPasswordForm({ token }: { token?: string }) {
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function requestReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    const form = new FormData(event.currentTarget);
    try {
      const result = await api("/api/auth/forgot-password", {
        email: form.get("email"),
      });
      setMessage(result.message);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function confirmReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    const form = new FormData(event.currentTarget);
    try {
      const result = await api("/api/auth/reset-password", {
        token,
        password: form.get("password"),
      });
      setMessage(result.message);
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
          <p className="eyebrow">доступ к кабинету</p>
          <h2>
            Сброс.
            <br />
            Новый ключ.
            <br />
            <em>Контроль.</em>
          </h2>
          <p>
            После смены пароля все активные
            <br />
            сессии на других устройствах завершатся.
          </p>
        </div>
        <span className="mono">kernell cloud</span>
        <div className="auth-orbit" aria-hidden="true" />
      </aside>
      <main id="main" className="auth-main">
        <Link href="/login" className="auth-back">
          ко входу
        </Link>
        <div className="auth-card">
          <span className="auth-icon">
            <KeyRound size={24} />
          </span>
          <h1>{token ? "Новый пароль." : "Восстановить доступ."}</h1>
          <p>
            {token
              ? "Задайте надёжный пароль длиной не менее 10 символов."
              : "Укажите email от кабинета — отправим одноразовую ссылку."}
          </p>
          {message ? (
            <>
              <p className="form-success" role="status">
                {message}
              </p>
              <Link href="/login" className="button button-accent full">
                перейти ко входу
              </Link>
            </>
          ) : token ? (
            <form onSubmit={confirmReset}>
              <label className="field">
                Новый пароль
                <div className="password-input">
                  <input
                    name="password"
                    type={show ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder="Не менее 10 символов"
                    minLength={10}
                    maxLength={128}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShow(!show)}
                    aria-label={show ? "Скрыть пароль" : "Показать пароль"}
                  >
                    {show ? <EyeOff size={19} /> : <Eye size={19} />}
                  </button>
                </div>
              </label>
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
              <button
                className="button button-accent full"
                disabled={busy}
                type="submit"
              >
                {busy && <LoaderCircle size={18} className="spin" />}
                сохранить новый пароль
              </button>
            </form>
          ) : (
            <form onSubmit={requestReset}>
              <label className="field">
                Email
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  maxLength={254}
                  required
                />
              </label>
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
              <button
                className="button button-accent full"
                disabled={busy}
                type="submit"
              >
                {busy && <LoaderCircle size={18} className="spin" />}
                отправить ссылку
              </button>
            </form>
          )}
          <p className="auth-switch">
            Вспомнили пароль? <Link href="/login">войти</Link>
          </p>
        </div>
        <span className="auth-foot mono">cloud.kernell.ru</span>
      </main>
    </div>
  );
}

