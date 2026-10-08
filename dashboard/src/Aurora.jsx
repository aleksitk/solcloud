import { useEffect, useRef } from "react";

function pathOf(ctx, width, height, time, lift) {
  ctx.beginPath();
  const steps = 80;
  for (let i = 0; i <= steps; i++) {
    const n = i / steps;
    const x = n * width;
    const y =
      height * (0.46 + n * 0.28) +
      lift +
      Math.sin(n * Math.PI * 2.15 + time) * height * (0.05 + n * 0.14) +
      Math.sin(n * Math.PI * 4.4 - time * 1.35) * height * 0.03;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
}

function stroke(ctx, width, height, time, lift, color, lineWidth, blur) {
  pathOf(ctx, width, height, time, lift);
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  ctx.stroke();
}

export default function Aurora() {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas.getContext("2d");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let time = 0.8;

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, canvas.offsetWidth) * dpr;
      canvas.height = Math.max(1, canvas.offsetHeight) * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function draw() {
      const width = canvas.offsetWidth;
      const height = canvas.offsetHeight;
      ctx.clearRect(0, 0, width, height);
      ctx.globalCompositeOperation = "source-over";
      ctx.shadowBlur = 0;
      stroke(ctx, width, height, time, 24, "rgba(70, 84, 98, 0.16)", 18, 0);
      stroke(ctx, width, height, time + 0.35, 0, "rgba(31, 92, 72, 0.45)", 1.5, 0);
    }

    function frame() {
      time += 0.006;
      draw();
      raf = requestAnimationFrame(frame);
    }

    resize();
    draw();
    if (!reduce) frame();
    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={ref} className="aurora" aria-hidden="true" />;
}
