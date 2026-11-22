"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, LoaderCircle, LockKeyhole } from "lucide-react";
import { api, DemoButton, Logo } from "./ui";

export function AuthForm({
  register = false,
  next = "/dashboard",
}: {
  register?: boolean;
  next?: string;
}) {
  const router = useRouter();
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      await api(`/api/auth/${register ? "register" : "login"}`, {
        email: form.get("email"),
        name: form.get("name"),
        password: form.get("password"),
        consent: form.get("consent") === "on",
      });
      router.push(next);
      router.refresh();
    } catch (error) {
      setError((error as Error).message);
      setBusy(false);
    }
  }
  return (
    <div className="auth-layout">
      <aside className="auth-aside">
        <Logo light />
        <div>
          <p className="eyebrow">ваше рабочее пространство</p>
          <h2>
            Идея.
            <br />
            Запуск.
            <br />
            <em>Масштаб.</em>
          </h2>
          <p>
            Домены и серверы.
            <br />
            Один кабинет. Ваши правила.
          </p>
        </div>
        <span className="mono">kernell cloud</span>
        <div className="auth-orbit" aria-hidden="true" />
      </aside>
      <main id="main" className="auth-main">
        <Link href="/" className="auth-back">
          На главную
        </Link>
        <div className="auth-card">
          <span className="auth-icon">
            <LockKeyhole size={24} />
          </span>
          <h1>{register ? "Начнём с аккаунта." : "С возвращением."}</h1>
          <p>
            {register
              ? "Создайте пространство для ваших проектов."
              : "Войдите, чтобы продолжить работу с проектами."}
          </p>
          <form onSubmit={submit}>
            {register && (
              <label className="field">
                Как к вам обращаться
                <input
                  name="name"
                  autoComplete="given-name"
                  placeholder="Ваше имя"
                  minLength={2}
                  maxLength={70}
                  required
                />
              </label>
            )}
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
            <label className="field">
              Пароль
              <div className="password-input">
                <input
                  name="password"
                  type={show ? "text" : "password"}
                  autoComplete={register ? "new-password" : "current-password"}
                  placeholder={
                    register ? "Не менее 10 символов" : "Введите пароль"
                  }
                  minLength={register ? 10 : 1}
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
            {register && (
              <label className="checkbox-field">
                <input name="consent" type="checkbox" required />
                <span>
                  Согласен на обработку данных согласно{" "}
                  <Link href="/privacy">политике конфиденциальности</Link>.
                </span>
              </label>
            )}
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
              {register ? "Создать аккаунт" : "Войти"}
            </button>
          </form>
          <p className="auth-switch">
            {register ? "Уже есть аккаунт?" : "Пока нет аккаунта?"}{" "}
            <Link
              href={`${register ? "/login" : "/register"}?next=${encodeURIComponent(next)}`}
            >
              {register ? "Войти" : "Зарегистрироваться"}
            </Link>
          </p>
          <div className="auth-divider">
            <span>Сначала познакомиться</span>
          </div>
          <DemoButton className="button button-outline full">
            Открыть демокабинет
          </DemoButton>
          <p className="auth-note">Без карты и настоящих покупок.</p>
        </div>
        <span className="auth-foot mono">cloud.kernell.ru</span>
      </main>
    </div>
  );
}
