"use client";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { Check, ChevronDown, Menu, Search, X, LoaderCircle } from "lucide-react";

export function Logo({ light = false }: { light?: boolean }) {
  return (
    <Link
      href="/"
      className={`logo ${light ? "light" : ""}`}
      aria-label="Kernell Cloud — главная"
    >
      kernell<sup>TM</sup>
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
            vps-серверы
          </Link>
          <Link
            href="/domains"
            aria-current={pathname === "/domains" ? "page" : undefined}
          >
            домены
          </Link>
          <a href="mailto:info@kernell.ru">поддержка</a>
        </nav>
        <Link
          className="button button-small header-account"
          href={signedIn ? "/dashboard" : "/login"}
          aria-label={signedIn ? "личный кабинет" : "войти в кабинет"}
        >
          <span className="header-account-full">
            {signedIn ? "личный кабинет" : "войти в кабинет"}
          </span>
          <span className="header-account-short" aria-hidden="true">
            кабинет
          </span>
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
    <footer className="site-footer">
      <div className="wrap footer-inner">
        <div className="footer-main">
          <div className="footer-brand">
            <Logo />
            <p>Домены и серверы для ваших проектов.</p>
          </div>
          <nav className="footer-nav" aria-label="Навигация в подвале">
            <Link href="/vps">vps-серверы</Link>
            <Link href="/domains">домены</Link>
            <a href="https://kernell.ru">основной сайт</a>
          </nav>
          <div className="footer-support">
            <span>поможем разобраться</span>
            <a href="mailto:info@kernell.ru">info@kernell.ru</a>
          </div>
        </div>
        <div className="footer-colophon">
          <span>© {new Date().getFullYear()} Kernell. Все права защищены.</span>
          <Link href="/privacy">конфиденциальность</Link>
        </div>
      </div>
    </footer>
  );
}
export async function api(
  path: string,
  body?: unknown,
  method?: "GET" | "POST" | "DELETE" | "PATCH",
) {
  const httpMethod = method ?? (body === undefined ? "GET" : "POST");
  const response = await fetch(path, {
    method: httpMethod,
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
  children = "посмотреть кабинет",
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
export function clientUuid(): string {
  if (typeof crypto !== "undefined") {
    if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
    if (typeof crypto.getRandomValues === "function") {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0"));
      return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10, 16).join("")}`;
    }
  }
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 14)}`;
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
    const element = ref.current;
    if (!element) return;
    const previous = document.activeElement as HTMLElement | null;
    if (!element.open) element.showModal();
    const onClose = () => {
      // StrictMode cleanup calls element.close(), which queues an async 'close'
      // task that lands after remount re-opens the dialog; ignore unless still closed.
      if (!element.open) closer.current();
    };
    element.addEventListener("close", onClose);
    return () => {
      element.removeEventListener("close", onClose);
      if (element.open) element.close();
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

export type SelectOption = {
  value: string;
  label: string;
  meta?: string;
  badge?: string;
};

export function SelectField({
  label,
  value,
  options,
  onChange,
  disabled = false,
  placeholder = "Выберите…",
  searchPlaceholder = "Быстрый поиск…",
  ariaLabel,
  className = "",
}: {
  label?: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  searchPlaceholder?: string;
  ariaLabel?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [openUp, setOpenUp] = useState(false);
  const [search, setSearch] = useState("");
  const [highlighted, setHighlighted] = useState(0);
  const labelId = useId();
  const listId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(
    () => options.find((opt) => opt.value === value) ?? null,
    [options, value],
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (opt) =>
        opt.label.toLowerCase().includes(q) ||
        (opt.meta && opt.meta.toLowerCase().includes(q)) ||
        (opt.badge && opt.badge.toLowerCase().includes(q)),
    );
  }, [options, search]);

  function openMenu() {
    if (disabled || !options.length) return;
    if (wrapRef.current) {
      const rect = wrapRef.current.getBoundingClientRect();
      const dialog = wrapRef.current.closest("dialog");
      const bounds = dialog ? dialog.getBoundingClientRect() : null;
      const topLimit = bounds ? bounds.top : 0;
      const bottomLimit = bounds ? bounds.bottom : window.innerHeight;
      const spaceBelow = bottomLimit - rect.bottom;
      const spaceAbove = rect.top - topLimit;
      setOpenUp(spaceBelow < 250 && spaceAbove > spaceBelow);
    }
    setSearch("");
    const currentIdx = options.findIndex((opt) => opt.value === value);
    setHighlighted(currentIdx >= 0 ? currentIdx : 0);
    setOpen(true);
  }

  function closeMenu(restoreFocus = false) {
    setOpen(false);
    setSearch("");
    if (restoreFocus) triggerRef.current?.focus();
  }

  function choose(optionValue: string) {
    onChange(optionValue);
    closeMenu(true);
  }

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      const active = menuRef.current?.querySelector('[aria-selected="true"]');
      if (active instanceof HTMLElement) {
        active.scrollIntoView({ block: "nearest" });
      }
    });
    const onPointerDown = (event: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) {
        closeMenu(false);
      }
    };
    const onDocKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeMenu(true);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onDocKeyDown, true);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onDocKeyDown, true);
    };
  }, [open]);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!open) {
      if (
        event.key === "ArrowDown" ||
        event.key === "ArrowUp" ||
        event.key === "Enter" ||
        event.key === " "
      ) {
        event.preventDefault();
        openMenu();
      }
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (visible.length) {
        setHighlighted((prev) => (prev + 1) % visible.length);
      }
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (visible.length) {
        setHighlighted((prev) => (prev - 1 + visible.length) % visible.length);
      }
    } else if (event.key === "Enter") {
      const target = event.target as HTMLElement;
      if (target.tagName === "INPUT" && visible.length) {
        event.preventDefault();
        choose(visible[Math.min(highlighted, visible.length - 1)].value);
      } else if (target === triggerRef.current && visible.length) {
        event.preventDefault();
        choose(visible[Math.min(highlighted, visible.length - 1)].value);
      }
    }
  }

  return (
    <div className={`field select-field ${className}`.trim()}>
      {label && (
        <span
          id={labelId}
          className="field-label"
          onClick={() => {
            if (!disabled) {
              triggerRef.current?.focus();
              if (open) closeMenu(false);
              else openMenu();
            }
          }}
        >
          {label}
        </span>
      )}
      <div
        ref={wrapRef}
        className={`custom-select ${open ? "is-open" : ""}`}
        onKeyDown={onKeyDown}
      >
        <button
          ref={triggerRef}
          type="button"
          className="select-trigger"
          role="combobox"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-labelledby={label ? labelId : undefined}
          aria-label={!label ? ariaLabel : undefined}
          disabled={disabled || !options.length}
          onClick={() => (open ? closeMenu(false) : openMenu())}
        >
          <span className="select-trigger-text">
            <span className="select-trigger-label">
              {selected ? selected.label : placeholder}
            </span>
            {selected?.meta && (
              <span className="select-trigger-meta mono">{selected.meta}</span>
            )}
          </span>
          {selected?.badge && (
            <span className="select-trigger-badge mono">{selected.badge}</span>
          )}
          <ChevronDown size={16} className="select-chevron" aria-hidden="true" />
        </button>
        {open && (
          <div
            ref={menuRef}
            id={listId}
            className={`select-menu ${openUp ? "open-up" : ""}`}
            role="listbox"
            aria-labelledby={label ? labelId : undefined}
          >
            {options.length >= 10 && (
              <div className="select-search">
                <Search size={14} aria-hidden="true" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setHighlighted(0);
                  }}
                  placeholder={searchPlaceholder}
                  autoComplete="off"
                />
              </div>
            )}
            <div className="select-options">
              {visible.length > 0 ? (
                visible.map((opt, idx) => {
                  const isSelected = opt.value === value;
                  const isHighlighted = idx === highlighted;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      className={`select-option ${isSelected ? "is-selected" : ""} ${isHighlighted ? "is-highlighted" : ""}`.trim()}
                      onMouseEnter={() => setHighlighted(idx)}
                      onClick={() => choose(opt.value)}
                    >
                      <span className="select-option-main">
                        <strong>{opt.label}</strong>
                        {opt.meta && (
                          <small className="mono">{opt.meta}</small>
                        )}
                      </span>
                      <span className="select-option-aside">
                        {opt.badge && (
                          <span className="select-option-badge mono">
                            {opt.badge}
                          </span>
                        )}
                        {isSelected && (
                          <Check size={15} className="select-option-check" aria-hidden="true" />
                        )}
                      </span>
                    </button>
                  );
                })
              ) : (
                <div className="select-empty">Ничего не найдено</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
