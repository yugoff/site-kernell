"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Вертикальный ролик в шапке. Играет без звука по кругу; при prefers-reduced-motion
 * не стартует сам и показывает постер.
 */
export function HeroVideo({ src, poster }: { src: string; poster: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [paused, setPaused] = useState(true);
  const [muted, setMuted] = useState(true);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");

    const apply = () => {
      if (reduced.matches) {
        video.pause();
        return;
      }
      video.muted = true;
      setMuted(true);
      video.play().catch(() => setPaused(true));
    };

    apply();
    reduced.addEventListener("change", apply);
    return () => reduced.removeEventListener("change", apply);
  }, []);

  const togglePlay = () => {
    const video = ref.current;
    if (!video) return;
    if (video.paused) video.play().catch(() => setPaused(true));
    else video.pause();
  };

  const toggleMute = () => {
    const video = ref.current;
    if (!video) return;
    video.muted = !video.muted;
    setMuted(video.muted);
  };

  const playLabel = paused ? "Запустить ролик" : "Поставить ролик на паузу";

  return (
    <aside className="hero-video" aria-label="Ролик о Kernell">
      <video
        ref={ref}
        className="hero-video-media"
        src={src}
        poster={poster}
        muted
        loop
        playsInline
        preload="auto"
        onPlay={() => setPaused(false)}
        onPause={() => setPaused(true)}
      />
      <div className="hero-controls">
        <button type="button" className="hero-control hero-playback" onClick={togglePlay} aria-label={playLabel} title={playLabel}>
          {paused ? (
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M8 5v14l11-7z" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M6 5h4v14H6zm8 0h4v14h-4z" />
            </svg>
          )}
        </button>
        <button
          type="button"
          className="hero-control hero-mute"
          onClick={toggleMute}
          aria-pressed={!muted}
          aria-label={muted ? "Включить звук" : "Выключить звук"}
        >
          {muted ? (
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M3 9v6h4l5 4V5L7 9H3zm13.59 3l2.7-2.7-1.41-1.42L15.17 10.6 12.46 7.88l-1.41 1.41 2.71 2.71-2.71 2.71 1.41 1.41 2.71-2.7 2.71 2.7 1.41-1.41-2.7-2.7z" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M3 9v6h4l5 4V5L7 9H3zm10.5 3a4.5 4.5 0 00-2.5-4.03v8.05A4.5 4.5 0 0013.5 12zm-2.5-9v2.06A7 7 0 0117 12a7 7 0 01-6 6.92V21A9 9 0 0019 12 9 9 0 0011 3z" />
            </svg>
          )}
          <span>{muted ? "со звуком" : "звук вкл."}</span>
        </button>
      </div>
    </aside>
  );
}
