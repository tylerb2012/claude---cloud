import type { HistoryPoint } from '../../engine';

interface Props {
  points: HistoryPoint[];
  baseline: number;
  durationMs: number;
}

/** Hand-drawn SVG sparkline with a dashed line at the starting balance. */
export function Sparkline({ points, baseline, durationMs }: Props) {
  const W = 320;
  const H = 64;
  const pad = 3;
  const values = points.map((p) => p.total);
  const min = Math.min(baseline, ...values);
  const max = Math.max(baseline, ...values);
  const span = max - min || 1;
  const x = (t: number) => pad + (t / durationMs) * (W - 2 * pad);
  const y = (v: number) => pad + (1 - (v - min) / span) * (H - 2 * pad);
  // step line: balance only changes when a trade closes
  let d = '';
  points.forEach((p, i) => {
    if (i === 0) d += `M${x(p.simTimeMs).toFixed(1)},${y(p.total).toFixed(1)}`;
    else d += `H${x(p.simTimeMs).toFixed(1)}V${y(p.total).toFixed(1)}`;
  });
  const last = points[points.length - 1];
  const up = last.total >= baseline;
  return (
    <svg className="sparkline" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img"
      aria-label={`Balance over the session, from ${baseline.toFixed(2)} to ${last.total.toFixed(2)}`}>
      <line x1={0} x2={W} y1={y(baseline)} y2={y(baseline)} className="spark-base" />
      <path d={d} className={`spark-line ${up ? 'up' : 'down'}`} vectorEffect="non-scaling-stroke" />
      <circle cx={x(last.simTimeMs)} cy={y(last.total)} r={2.5} className={`spark-dot ${up ? 'up' : 'down'}`} />
    </svg>
  );
}
