"use client";

import { useEffect } from "react";

/** Для превью: ?hue=250 в адресе перекрашивает всю страницу в другой оттенок (0–360). */
export function HueParam() {
  useEffect(() => {
    const hue = Number(new URLSearchParams(window.location.search).get("hue"));
    if (hue > 0 && hue <= 360) document.documentElement.style.setProperty("--k2-hue", String(hue));
  }, []);
  return null;
}
