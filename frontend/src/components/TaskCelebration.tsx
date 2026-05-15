import { useEffect, useRef, useState } from 'react';

/**
 * Celebration overlay that fires when a task is marked complete. Listens to
 * a custom window event dispatched by `triggerTaskCelebration()`. Renders
 * canvas fireworks with multiple coloured bursts and auto-cleans itself
 * once the last particle dies out.
 */

type Burst = { id: number };

let nextBurstId = 1;

export function triggerTaskCelebration(type: 'complete') {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('digitech:task-celebration', { detail: { type } }));
}

export function TaskCelebration() {
  const [bursts, setBursts] = useState<Burst[]>([]);

  useEffect(() => {
    const handler = (event: Event) => {
      const ce = event as CustomEvent<{ type?: 'complete' }>;
      if (ce.detail?.type !== 'complete') return;
      const id = nextBurstId++;
      setBursts((prev) => [...prev, { id }]);
      // Fireworks: 6 bursts spaced ≤700ms apart + ~1s particle lifetime.
      window.setTimeout(() => {
        setBursts((prev) => prev.filter((b) => b.id !== id));
      }, 5600);
    };
    window.addEventListener('digitech:task-celebration', handler);
    return () => window.removeEventListener('digitech:task-celebration', handler);
  }, []);

  if (bursts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[100] overflow-hidden">
      {bursts.map((burst) => (
        <FireworksBurst key={burst.id} />
      ))}
    </div>
  );
}

/**
 * Canvas-based fireworks. Spawns up to 6 random bursts of 50 sparks each.
 * Each spark has gravity + drag and fades over ~55 frames.
 */
function FireworksBurst() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Match the canvas backing buffer to the viewport so coordinates line up
    // with the burst origin we compute below.
    const setSize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    setSize();
    window.addEventListener('resize', setSize);

    type Spark = {
      x: number;
      y: number;
      vx: number;
      vy: number;
      color: string;
      life: number;
    };
    let particles: Spark[] = [];

    const spawnSpark = (x: number, y: number, color: string): Spark => {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 5 + 2;
      return {
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color,
        life: 1,
      };
    };

    let count = 0;
    let burstTimer: number | null = null;
    let rafId: number | null = null;
    let stopped = false;

    const burst = () => {
      if (stopped) return;
      const x = 80 + Math.random() * (canvas.width - 160);
      const y = 40 + Math.random() * (canvas.height * 0.5);
      const color = `hsl(${Math.random() * 360},90%,65%)`;
      for (let i = 0; i < 50; i++) particles.push(spawnSpark(x, y, color));
      if (++count < 6) {
        burstTimer = window.setTimeout(burst, 400 + Math.random() * 300);
      }
    };

    const loop = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles = particles.filter((p) => p.life > 0);
      for (const p of particles) {
        p.vy += 0.1;
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.98;
        p.vy *= 0.98;
        p.life -= 0.018;

        ctx.save();
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      if (!stopped && (particles.length > 0 || count < 6)) {
        rafId = requestAnimationFrame(loop);
      }
    };

    burst();
    rafId = requestAnimationFrame(loop);

    return () => {
      stopped = true;
      if (burstTimer !== null) window.clearTimeout(burstTimer);
      if (rafId !== null) cancelAnimationFrame(rafId);
      window.removeEventListener('resize', setSize);
    };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden="true" />;
}

export default TaskCelebration;
