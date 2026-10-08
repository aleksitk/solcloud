import { useEffect, useRef } from "react";

const COUNT = 36;

export default function Field() {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas.getContext("2d");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const points = Array.from({ length: COUNT }, () => ({
      x: Math.random(),
      y: Math.random(),
      vx: (Math.random() - 0.5) * 0.00009,
      vy: (Math.random() - 0.5) * 0.00009,
    }));
    let raf = 0;
    let running = !reduce;

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, window.innerWidth) * dpr;
      canvas.height = Math.max(1, window.innerHeight) * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function draw() {
      const width = window.innerWidth;
      const height = window.innerHeight;
      ctx.clearRect(0, 0, width, height);
      const reach = Math.min(168, width * 0.16);
      for (let i = 0; i < points.length; i += 1) {
        const a = points[i];
        if (running) {
          a.x += a.vx;
          a.y += a.vy;
          if (a.x < 0 || a.x > 1) a.vx *= -1;
          if (a.y < 0 || a.y > 1) a.vy *= -1;
        }
        for (let j = i + 1; j < points.length; j += 1) {
          const b = points[j];
          const dx = (a.x - b.x) * width;
          const dy = (a.y - b.y) * height;
          const dist = Math.hypot(dx, dy);
          if (dist > reach) continue;
          const alpha = (1 - dist / reach) * 0.28;
          ctx.strokeStyle = `rgba(92, 62, 148, ${alpha * 0.85})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(a.x * width, a.y * height);
          ctx.lineTo(b.x * width, b.y * height);
          ctx.stroke();
        }
      }
      for (const point of points) {
        ctx.fillStyle = "rgba(23, 21, 28, 0.55)";
        ctx.beginPath();
        ctx.arc(point.x * width, point.y * height, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    function frame() {
      draw();
      raf = requestAnimationFrame(frame);
    }

    function onVisibility() {
      const hidden = document.hidden;
      if (hidden) {
        cancelAnimationFrame(raf);
        raf = 0;
        return;
      }
      if (running && !raf) frame();
    }

    resize();
    draw();
    if (running) frame();
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return <canvas ref={ref} className="field" aria-hidden="true" />;
}
