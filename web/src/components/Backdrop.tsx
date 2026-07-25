import { useEffect, useRef } from "react";

/**
 * A quiet particle drift behind the dashboard — the same visual language as the
 * landing page, dialled right down so it reads as atmosphere and never competes
 * with the data. Vanilla canvas, no dependencies.
 */
export function Backdrop() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const g2d = el.getContext("2d");
    if (!g2d) return;
    const canvas = el;
    const ctx = g2d;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = 0, h = 0, raf = 0;
    const N = window.innerWidth < 760 ? 46 : 90;
    const hues = [
      [131, 110, 249], [61, 220, 151], [131, 110, 249], [90, 80, 150],
    ];
    const pts = Array.from({ length: N }, (_, i) => ({
      x: Math.random(), y: Math.random(),
      vx: (Math.random() - 0.5) * 0.00016,
      vy: (Math.random() - 0.5) * 0.00016,
      s: 0.6 + Math.random() * 2.2,
      c: hues[i % hues.length]!,
      tw: Math.random() * Math.PI * 2,
    }));

    function resize() {
      w = window.innerWidth; h = window.innerHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
      canvas.style.width = w + "px"; canvas.style.height = h + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    let t = 0;
    function frame() {
      raf = requestAnimationFrame(frame);
      t += 0.016;
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = "lighter";
      for (const p of pts) {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > 1) p.vx *= -1;
        if (p.y < 0 || p.y > 1) p.vy *= -1;
        const a = 0.3 + Math.sin(t * 0.8 + p.tw) * 0.2;
        ctx.beginPath();
        ctx.fillStyle = `rgba(${p.c[0]},${p.c[1]},${p.c[2]},${a})`;
        ctx.shadowColor = `rgba(${p.c[0]},${p.c[1]},${p.c[2]},${a})`;
        ctx.shadowBlur = p.s * 5;
        ctx.arc(p.x * w, p.y * h, p.s, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;
    }

    resize();
    window.addEventListener("resize", resize);
    frame();
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, []);

  return <canvas ref={ref} className="backdrop" aria-hidden="true" />;
}
