"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/button";
import { AsciiTetrahedron } from "@/components/ascii-canvas";
import { useInView } from "@/lib/use-in-view";
import { cn } from "@/lib/utils";
import { MAIL_DISCUSS, TELEGRAM_URL } from "@/lib/contact";
import { CopyEmail } from "@/components/copy-email";

export function CtaSection() {
  const { ref, visible } = useInView<HTMLElement>(0.2);
  const [mouse, setMouse] = useState({ x: 0, y: 0 });

  return (
    <section id="contact" ref={ref} className="relative py-24 lg:py-32 overflow-hidden">
      <div className="max-w-[1400px] mx-auto px-6 lg:px-12">
        <div
          className={cn(
            "relative border border-foreground transition-all duration-1000",
            visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8",
          )}
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            setMouse({
              x: ((e.clientX - rect.left) / rect.width) * 100,
              y: ((e.clientY - rect.top) / rect.height) * 100,
            });
          }}
        >
          <div
            className="absolute inset-0 opacity-10 pointer-events-none transition-opacity duration-300"
            style={{ background: `radial-gradient(600px circle at ${mouse.x}% ${mouse.y}%, rgba(0,0,0,0.15), transparent 40%)` }}
          />

          <div className="relative z-10 px-8 lg:px-16 py-16 lg:py-24">
            <div className="flex flex-col lg:flex-row items-center justify-between gap-12">
              <div className="flex-1">
                <h2 className="text-4xl lg:text-7xl font-display tracking-tight mb-8 leading-[0.95]">
                  Расскажите,
                  <br />
                  какую задачу хотите решить
                </h2>
                <p className="text-xl text-muted-foreground mb-12 leading-relaxed max-w-xl">
                  Обсудим, где ИИ может дать вашему бизнесу измеримый эффект, и предложим следующий шаг.
                </p>
                <div className="flex flex-col sm:flex-row items-start gap-4">
                  <Button href={MAIL_DISCUSS} size="lg" className="bg-foreground hover:bg-foreground/90 text-background px-8 h-14 text-base rounded-full group">
                    Обсудить задачу
                    <ArrowRight className="w-4 h-4 ml-2 transition-transform group-hover:translate-x-1" />
                  </Button>
                  <Button
                    href={TELEGRAM_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    size="lg"
                    variant="outline"
                    className="h-14 px-8 text-base rounded-full border-foreground/20 hover:bg-foreground/5"
                  >
                    Написать в Telegram
                  </Button>
                </div>
                <div className="mt-8 space-y-4">
                  <CopyEmail />
                  <p className="text-sm text-muted-foreground font-mono">
                    Первая консультация — чтобы определить следующий шаг.
                  </p>
                </div>
              </div>

              <div className="hidden lg:flex items-center justify-center w-[500px] h-[500px] -mr-16">
                <AsciiTetrahedron />
              </div>
            </div>
          </div>

          <div className="absolute top-0 right-0 w-32 h-32 border-b border-l border-foreground/10" />
          <div className="absolute bottom-0 left-0 w-32 h-32 border-t border-r border-foreground/10" />
        </div>
      </div>
    </section>
  );
}
