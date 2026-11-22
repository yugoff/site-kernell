"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { Menu, X, LoaderCircle } from "lucide-react";

export function Logo({ light = false }: { light?: boolean }) {
  return (
    <Link
      href="/"
      className={`logo ${light ? "light" : ""}`}
      aria-label="Kernell Cloud — главная"
    >
      kernell<sup>™</sup>
      <span>cloud</span>
    </Link>
  );
}
export function Header({ signedIn = false }: { signedIn?: boolean }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);
  return (
    <header className="site-header">
      <div className="wrap header-inner">
        <Logo />
        <nav
          className={open ? "public-nav is-open" : "public-nav"}
          aria-label="Основная навигация"
        >
          <Link
            href="/vps"
            aria-current={pathname === "/vps" ? "page" : undefined}
          >
            VPS-серверы
          </Link>
          <Link
            href="/domains"
            aria-current={pathname === "/domains" ? "page" : undefined}
          >
            Домены
          </Link>
          <a href="mailto:info@kernell.ru">Поддержка</a>
        </nav>
        <Link
          className="button button-small"
          href={signedIn ? "/dashboard" : "/login"}
        >
          {signedIn ? "Личный кабинет" : "Войти в кабинет"}
        </Link>
        <button
          className="icon-button mobile-menu"
          onClick={() => setOpen(!open)}
          aria-label={open ? "Закрыть меню" : "Открыть меню"}
          aria-expanded={open}
        >
          {open ? <X /> : <Menu />}
        </button>
      </div>
    </header>
  );
}
export function Footer() {
  return (
    <footer className="footer wrap">
      <div>
        <Logo />
        <p>Инфраструктура для ваших идей.</p>
      </div>
      <div>
        <a href="https://kernell.ru">Основной сайт Kernell</a>
        <Link href="/privacy">Конфиденциальность</Link>
        <a href="mailto:info@kernell.ru">info@kernell.ru</a>
      </div>
      <span className="mono">© {new Date().getFullYear()} Kernell</span>
    </footer>
  );
}
export async function api(path: string, body?: unknown) {
  const response = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error || "Не удалось выполнить действие.");
  return data;
}
export function DemoButton({
  className = "button button-outline",
  children = "Посмотреть кабинет",
}: {
  className?: string;
  children?: ReactNode;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function open() {
    setBusy(true);
    setError("");
    try {
      await api("/api/auth/demo", {});
      router.push("/dashboard");
      router.refresh();
    } catch (error) {
      setError((error as Error).message);
      setBusy(false);
    }
  }
  return (
    <span className="demo-entry">
      <button onClick={open} disabled={busy} className={className}>
        {busy && <LoaderCircle className="spin" size={17} />}
        {children}
      </button>
      {error && (
        <span role="alert" className="field-error">
          {error}
        </span>
      )}
    </span>
  );
}
export function Modal({
  title,
  children,
  close,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const closer = useRef(close);
  closer.current = close;
  useEffect(() => {
    const element = ref.current!;
    const previous = document.activeElement as HTMLElement;
    element.showModal();
    const onClose = () => closer.current();
    element.addEventListener("close", onClose);
    return () => {
      element.removeEventListener("close", onClose);
      element.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby="modal-title"
      onClick={(event) => {
        const bounds = ref.current!.getBoundingClientRect();
        if (
          event.target === ref.current &&
          (event.clientX < bounds.left ||
            event.clientX > bounds.right ||
            event.clientY < bounds.top ||
            event.clientY > bounds.bottom)
        )
          close();
      }}
    >
      <div className="modal-heading">
        <h2 id="modal-title">{title}</h2>
        <button
          onClick={close}
          aria-label="Закрыть окно"
          className="icon-button"
        >
          <X />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function PreviewNotice() {
  return (
    <div className="preview-notice">
      <span className="tag">Ранний доступ</span>
      <span>
        Знакомимся с Cloud. Тарифы предварительные, оплата пока недоступна.
      </span>
    </div>
  );
}
