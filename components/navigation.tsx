"use client";

import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/button";
import { cn } from "@/lib/utils";

const links = [
  { name: "Что делаем", href: "#features" },
  { name: "Как работаем", href: "#how-it-works" },
  { name: "Решения", href: "#cases" },
  { name: "Вопросы", href: "#faq" },
  { name: "Контакты", href: "#contact" },
];

export function Navigation() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "fixed z-50 transition-all duration-500",
        scrolled ? "top-4 left-4 right-4" : "top-0 left-0 right-0",
      )}
    >
      <nav
        className={cn(
          "mx-auto transition-all duration-500",
          scrolled || open
            ? "bg-background/80 backdrop-blur-xl border border-foreground/10 rounded-2xl shadow-lg max-w-[1200px]"
            : "bg-transparent max-w-[1400px]",
        )}
      >
        <div
          className={cn(
            "flex items-center justify-between transition-all duration-500 px-6 lg:px-8",
            scrolled ? "h-14" : "h-20",
          )}
        >
          <a href="#" className="flex items-center gap-2 group">
            <span className={cn("font-display tracking-tight transition-all duration-500", scrolled ? "text-xl" : "text-2xl")}>
              Kernell
            </span>
            <span
              className={cn(
                "text-muted-foreground font-mono transition-all duration-500",
                scrolled ? "text-[10px] mt-0.5" : "text-xs mt-1",
              )}
            >
              TM
            </span>
          </a>

          <div className="hidden md:flex items-center gap-7 lg:gap-12">
            {links.map((link) => (
              <a
                key={link.name}
                href={link.href}
                className="text-sm text-foreground/70 hover:text-foreground transition-colors duration-300 relative group"
              >
                {link.name}
                <span className="absolute -bottom-1 left-0 w-0 h-px bg-foreground transition-all duration-300 group-hover:w-full" />
              </a>
            ))}
          </div>

          <div className="hidden md:flex items-center gap-4">
            <Button
              href="#contact"
              size="sm"
              className={cn(
                "bg-foreground hover:bg-foreground/90 text-background rounded-full transition-all duration-500",
                scrolled ? "px-4 h-8 text-xs" : "px-6",
              )}
            >
              Обсудить задачу
            </Button>
          </div>

          <button onClick={() => setOpen(!open)} className="md:hidden p-2" aria-label="Toggle menu">
            {open ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </nav>

      <div
        className={cn(
          "md:hidden fixed inset-0 bg-background z-40 transition-all duration-500",
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none",
        )}
        style={{ top: 0 }}
      >
        <div className="flex flex-col h-full px-8 pt-28 pb-8">
          <div className="flex-1 flex flex-col justify-center gap-8">
            {links.map((link, i) => (
              <a
                key={link.name}
                href={link.href}
                onClick={() => setOpen(false)}
                className={cn(
                  "text-5xl font-display text-foreground hover:text-muted-foreground transition-all duration-500",
                  open ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4",
                )}
                style={{ transitionDelay: open ? `${75 * i}ms` : "0ms" }}
              >
                {link.name}
              </a>
            ))}
          </div>
          <div
            className={cn(
              "flex gap-4 pt-8 border-t border-foreground/10 transition-all duration-500",
              open ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4",
            )}
            style={{ transitionDelay: open ? "300ms" : "0ms" }}
          >
            <Button href="#contact" className="flex-1 bg-foreground text-background rounded-full h-14 text-base" onClick={() => setOpen(false)}>
              Обсудить задачу
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}
