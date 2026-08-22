"use client";

import { useEffect, useRef } from "react";
import { useTheme } from "@/src/components/ThemeProvider";

// Same technique as Odysseus's "Constellations" background
// (static/js/theme.js _initConstellations): a handful of dots drift
// slowly, a line fades in between any two that get close, dots twinkle
// via a sine phase. Ported here as a real React component rather than
// copied verbatim — self-contained requestAnimationFrame loop, reads
// the app's own --accent token each frame so it follows theme changes
// without a reload, only runs in dark mode (the dots wouldn't read
// against the light theme's cream background), and freezes to a single
// static frame under prefers-reduced-motion.
// First pass (50 stars, low opacity) was invisible against the real
// dashboard's dense card grid. Bumping intensity to compensate overcorrected:
// with this many cards, "visible" reads as clutter poking into card
// whitespace rather than an ambient touch. Settled on a middle ground — a
// faint wallpaper texture (think a terminal's barely-there background
// image), not a foreground animation competing with content.
const STAR_COUNT = 60;
const CONNECT_DIST = 130;

type Star = { x: number; y: number; vx: number; vy: number; r: number; phase: number };

export function ConstellationBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    if (resolvedTheme !== "dark") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let width = 0;
    let height = 0;
    let stars: Star[] = [];
    let rafId = 0;

    const initStars = () => {
      stars = Array.from({ length: STAR_COUNT }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.15,
        vy: (Math.random() - 0.5) * 0.15,
        r: 0.7 + Math.random() * 0.7,
        phase: Math.random() * Math.PI * 2,
      }));
    };

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (stars.length === 0) initStars();
    };
    resize();
    const onResize = () => { resize(); initStars(); };
    window.addEventListener("resize", onResize);

    const getColor = () =>
      getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#5aada9";

    let t = 0;
    const draw = () => {
      if (!reduceMotion) rafId = requestAnimationFrame(draw);
      t += 0.01;
      ctx.clearRect(0, 0, width, height);
      const color = getColor();

      if (!reduceMotion) {
        for (const s of stars) {
          s.x += s.vx; s.y += s.vy;
          if (s.x < 0) s.x = width; if (s.x > width) s.x = 0;
          if (s.y < 0) s.y = height; if (s.y > height) s.y = 0;
        }
      }

      ctx.strokeStyle = color;
      ctx.lineWidth = 0.5;
      for (let i = 0; i < stars.length; i++) {
        for (let j = i + 1; j < stars.length; j++) {
          const dx = stars[i].x - stars[j].x;
          const dy = stars[i].y - stars[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < CONNECT_DIST) {
            ctx.globalAlpha = (1 - dist / CONNECT_DIST) * 0.08;
            ctx.beginPath();
            ctx.moveTo(stars[i].x, stars[i].y);
            ctx.lineTo(stars[j].x, stars[j].y);
            ctx.stroke();
          }
        }
      }

      ctx.fillStyle = color;
      for (const s of stars) {
        const twinkle = reduceMotion ? 0.75 : 0.5 + 0.5 * Math.sin(t * 2 + s.phase);
        ctx.globalAlpha = 0.06 + twinkle * 0.1;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };
    draw();

    return () => {
      window.removeEventListener("resize", onResize);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [resolvedTheme]);

  if (resolvedTheme !== "dark") return null;

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      // z-index:-1 (not 0) — guarantees this paints below normal, non-positioned
      // page content regardless of the app's own stacking contexts, so it can
      // only ever show through genuinely transparent gaps, never over a card.
      style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: -1 }}
    />
  );
}
