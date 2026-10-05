"use client";

import { useEffect, useRef } from "react";

/**
 * Canvas с ASCII-анимацией. `draw` вызывается каждый кадр с контекстом,
 * размерами в CSS-пикселях и счётчиком времени `t`, которым управляет `step`.
 */
type DrawFn = (ctx: CanvasRenderingContext2D, w: number, h: number, t: number) => void;

function AsciiCanvas({ draw, step }: { draw: DrawFn; step: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let t = 0;
    let raf = 0;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
    };
    resize();
    window.addEventListener("resize", resize);

    const frame = () => {
      const rect = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, rect.width, rect.height);
      draw(ctx, rect.width, rect.height, t);
      t += step;
      raf = requestAnimationFrame(frame);
    };
    frame();

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(raf);
    };
  }, [draw, step]);

  return <canvas ref={canvasRef} className="w-full h-full" style={{ display: "block" }} />;
}

const SPHERE_CHARS = "░▒▓█▀▄▌▐│─┤├┴┬╭╮╰╯";

const drawSphere: DrawFn = (ctx, w, h, t) => {
  const cx = w / 2;
  const cy = h / 2;
  const radius = Math.min(w, h) * 0.525;
  ctx.font = "12px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const points: { x: number; y: number; z: number; char: string }[] = [];
  for (let theta = 0; theta < 2 * Math.PI; theta += 0.15) {
    for (let phi = 0; phi < Math.PI; phi += 0.15) {
      const x = Math.sin(phi) * Math.cos(theta + t * 0.5);
      const y = Math.sin(phi) * Math.sin(theta + t * 0.5);
      const z = Math.cos(phi);

      const a = t * 0.3;
      const x1 = x * Math.cos(a) - z * Math.sin(a);
      const z1 = x * Math.sin(a) + z * Math.cos(a);
      const b = t * 0.2;
      const y2 = y * Math.cos(b) - z1 * Math.sin(b);
      const z2 = y * Math.sin(b) + z1 * Math.cos(b);

      const idx = Math.floor(((z2 + 1) / 2) * (SPHERE_CHARS.length - 1));
      points.push({ x: cx + x1 * radius, y: cy + y2 * radius, z: z2, char: SPHERE_CHARS[idx] });
    }
  }
  points.sort((p, q) => p.z - q.z);
  for (const p of points) {
    ctx.fillStyle = `rgba(0, 0, 0, ${0.2 + (p.z + 1) * 0.4})`;
    ctx.fillText(p.char, p.x, p.y);
  }
};

type V3 = { x: number; y: number; z: number };

const TETRA_VERTS: V3[] = [
  { x: 0, y: 1, z: 0 },
  { x: -0.943, y: -0.333, z: -0.5 },
  { x: 0.943, y: -0.333, z: -0.5 },
  { x: 0, y: -0.333, z: 1 },
];
const TETRA_EDGES = [[0, 1], [0, 2], [0, 3], [1, 2], [2, 3], [3, 1]];
const TETRA_FACES = [[0, 1, 2], [0, 2, 3], [0, 3, 1], [1, 3, 2]];

const rotY = (p: V3, a: number): V3 => ({
  x: p.x * Math.cos(a) - p.z * Math.sin(a),
  y: p.y,
  z: p.x * Math.sin(a) + p.z * Math.cos(a),
});
const rotX = (p: V3, a: number): V3 => ({
  x: p.x,
  y: p.y * Math.cos(a) - p.z * Math.sin(a),
  z: p.y * Math.sin(a) + p.z * Math.cos(a),
});
const rotZ = (p: V3, a: number): V3 => ({
  x: p.x * Math.cos(a) - p.y * Math.sin(a),
  y: p.x * Math.sin(a) + p.y * Math.cos(a),
  z: p.z,
});

const drawTetrahedron: DrawFn = (ctx, w, h, t) => {
  const cx = w / 2;
  const cy = h / 2;
  const scale = Math.min(w, h) * 0.7;
  ctx.font = "18px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const points: { x: number; y: number; z: number; char: string }[] = [];
  const push = (p: V3) => {
    const r = rotZ(rotX(rotY(p, t * 0.4), t * 0.3), t * 0.2);
    const idx = Math.floor(((r.z + 1.5) / 3) * (SPHERE_CHARS.length - 1));
    points.push({
      x: cx + r.x * scale,
      y: cy - r.y * scale,
      z: r.z,
      char: SPHERE_CHARS[Math.min(idx, SPHERE_CHARS.length - 1)],
    });
  };

  for (const [a, b] of TETRA_EDGES) {
    const p = TETRA_VERTS[a];
    const q = TETRA_VERTS[b];
    for (let s = 0; s <= 1; s += 0.05) {
      push({ x: p.x + (q.x - p.x) * s, y: p.y + (q.y - p.y) * s, z: p.z + (q.z - p.z) * s });
    }
  }
  for (const [a, b, c] of TETRA_FACES) {
    const p = TETRA_VERTS[a];
    const q = TETRA_VERTS[b];
    const r = TETRA_VERTS[c];
    for (let u = 0; u <= 1; u += 0.12) {
      for (let v = 0; v <= 1 - u; v += 0.12) {
        const k = 1 - u - v;
        push({
          x: p.x * u + q.x * v + r.x * k,
          y: p.y * u + q.y * v + r.y * k,
          z: p.z * u + q.z * v + r.z * k,
        });
      }
    }
  }

  points.sort((p, q) => p.z - q.z);
  for (const p of points) {
    ctx.fillStyle = `rgba(0, 0, 0, ${Math.min(0.15 + (p.z + 1.5) * 0.25, 0.9)})`;
    ctx.fillText(p.char, p.x, p.y);
  }
};

const WAVE_CHARS = "·∘○◯◌●◉";

const drawWave: DrawFn = (ctx, w, h, t) => {
  ctx.font = "14px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const cols = Math.floor(w / 20);
  const rows = Math.floor(h / 20);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = (col + 0.5) * (w / cols);
      const y = (row + 0.5) * (h / rows);
      const v =
        ((Math.sin(0.2 * col + 2 * t) * Math.cos(0.15 * row + t) +
          Math.sin((col + row) * 0.1 + 1.5 * t) +
          Math.cos(0.1 * col - 0.1 * row + 0.8 * t)) /
          3 +
          1) /
        2;
      ctx.fillStyle = `rgba(0, 0, 0, ${0.15 + 0.5 * v})`;
      ctx.fillText(WAVE_CHARS[Math.floor(v * (WAVE_CHARS.length - 1))], x, y);
    }
  }
};

export const AsciiSphere = () => <AsciiCanvas draw={drawSphere} step={0.02} />;
export const AsciiTetrahedron = () => <AsciiCanvas draw={drawTetrahedron} step={0.015} />;
export const AsciiWave = () => <AsciiCanvas draw={drawWave} step={0.03} />;
