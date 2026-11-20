import { useEffect, useRef, useState } from 'react';
import type { Token } from './market';

/** $0.0₄148 style for tiny prices, so long strings of zeros stay readable. */
export function fmtPrice(p: number): string {
  if (p >= 1) return '$' + p.toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
  if (p >= 0.001) return '$' + p.toPrecision(3);
  const zeros = Math.floor(-Math.log10(p)) - 1;
  const digits = Math.round(p * Math.pow(10, zeros + 4)).toString().slice(0, 3);
  const sub = String(zeros).split('').map((d) => '₀₁₂₃₄₅₆₇₈₉'[Number(d)]).join('');
  return `$0.0${sub}${digits}`;
}

export function compact(n: number): string {
  return '$' + Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}

export const money = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const signed = (n: number) => (n >= 0 ? '+' : '−') + money(Math.abs(n));
export const pct = (n: number, d = 1) => (n >= 0 ? '+' : '−') + Math.abs(n * 100).toLocaleString('en-US', { maximumFractionDigits: d }) + '%';
export const toneOf = (n: number) => (n > 0.0005 ? 'up' : n < -0.0005 ? 'down' : 'flat');

const reduceMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Number that rolls smoothly to its new value. */
export function Rolling({ value, format = money, className = '' }: { value: number; format?: (n: number) => string; className?: string }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    if (reduceMotion()) {
      setShown(value);
      return;
    }
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const frame = (t: number) => {
      const k = Math.min(1, (t - start) / 500);
      const v = a + (value - a) * (1 - Math.pow(1 - k, 3));
      setShown(v);
      from.current = v;
      if (k < 1) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  const text = format(shown);
  const dot = text.lastIndexOf('.');
  return (
    <span className={`rolling ${className}`}>
      {dot > 0 ? <>{text.slice(0, dot)}<span className="cents">{text.slice(dot)}</span></> : text}
    </span>
  );
}

export function Avatar({ t, size = 44 }: { t: Pick<Token, 'emoji' | 'hue'>; size?: number }) {
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.5, ['--h' as string]: t.hue }} aria-hidden="true">
      {t.emoji}
    </span>
  );
}

export function Spark({ values, w = 120, h = 34, className = '' }: { values: number[]; w?: number; h?: number; className?: string }) {
  if (values.length < 2) return null;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || hi || 1;
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * w).toFixed(1)},${(2 + (1 - (v - lo) / span) * (h - 4)).toFixed(1)}`);
  const up = values[values.length - 1] >= values[0];
  return (
    <svg className={`spark ${up ? 'up' : 'down'} ${className}`} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
      <polygon points={`0,${h} ${pts.join(' ')} ${w},${h}`} className="spark-fill" />
      <polyline points={pts.join(' ')} className="spark-stroke" />
    </svg>
  );
}

/** Short confetti burst on a canvas overlay. Skipped when reduced motion is on. */
export function burstConfetti(x = innerWidth / 2, y = innerHeight / 3) {
  if (reduceMotion()) return;
  const c = document.createElement('canvas');
  c.className = 'confetti';
  c.width = innerWidth * devicePixelRatio;
  c.height = innerHeight * devicePixelRatio;
  document.body.appendChild(c);
  const ctx = c.getContext('2d')!;
  ctx.scale(devicePixelRatio, devicePixelRatio);
  const colors = ['#c6f135', '#2fd57e', '#4ca8ff', '#ff5ad1', '#ffb020', '#a78bfa'];
  const parts = Array.from({ length: 90 }, () => ({
    x, y, vx: (Math.random() - 0.5) * 9, vy: -Math.random() * 9 - 3, r: Math.random() * 6 + 3,
    c: colors[Math.floor(Math.random() * colors.length)], a: Math.random() * Math.PI, va: (Math.random() - 0.5) * 0.3,
  }));
  const t0 = performance.now();
  const frame = (t: number) => {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    for (const p of parts) {
      p.vy += 0.25;
      p.x += p.vx;
      p.y += p.vy;
      p.a += p.va;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.a);
      ctx.fillStyle = p.c;
      ctx.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2);
      ctx.restore();
    }
    if (t - t0 < 1800) requestAnimationFrame(frame);
    else c.remove();
  };
  requestAnimationFrame(frame);
}
