"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { EMAIL } from "@/lib/contact";

/** Почта: клик по адресу открывает почтовый клиент, кнопка рядом копирует адрес. */
export function CopyEmail() {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(EMAIL);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Буфер недоступен (например, http): адрес остаётся доступен как ссылка.
    }
  };

  return (
    <div className="flex items-center gap-3 font-mono text-sm">
      <a href={`mailto:${EMAIL}`} className="underline underline-offset-4 decoration-foreground/30 hover:decoration-foreground transition-colors">
        {EMAIL}
      </a>
      <button
        type="button"
        onClick={copy}
        aria-label="Скопировать почту"
        className="p-2 border border-foreground/10 rounded-full text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
      >
        {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
}
