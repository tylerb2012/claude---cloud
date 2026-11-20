import type { HistoryPoint, VenueState } from '../../engine';

interface Props {
  points: HistoryPoint[];
  venues: VenueState[];
  accents: string[];
  durationMs: number;
}

/**
 * Each line is a balance divided by its own start, so the three venues and the
 * total share one scale. The dashed line is 1× (the starting balance).
 */
export function Chart({ points, venues, accents, durationMs }: Props) {
  const W = 200;
  const H = 72;
  const pad = 5;
  const total0 = points[0].total;
  const series = [
    ...venues.map((v, i) => ({ key: v.id, cls: `line venue-line accent-${accents[i]}`, vals: points.map((p) => p.venues[i] / v.startBalance) })),
    { key: 'total', cls: 'line total-line', vals: points.map((p) => p.total / total0) },
  ];
  const all = series.flatMap((s) => s.vals);
  const min = Math.min(1, ...all);
  const max = Math.max(1, ...all);
  const span = max - min || 0.01;
  const x = (t: number) => pad + (t / durationMs) * (W - 2 * pad);
  const y = (v: number) => pad + (1 - (v - min) / span) * (H - 2 * pad);
  const path = (vals: number[]) =>
    vals.map((v, i) => `${i ? 'L' : 'M'}${x(points[i].simTimeMs).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const last = points[points.length - 1];
  const endTotal = series[series.length - 1].vals.at(-1)!;
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img"
      aria-label={`Simulated balance went from ${total0.toFixed(2)} to ${last.total.toFixed(2)} dollars`}>
      <line x1={pad} x2={W - pad} y1={y(1)} y2={y(1)} className="chart-base" />
      {series.map((s) => <path key={s.key} d={path(s.vals)} className={s.cls} />)}
      <circle cx={x(last.simTimeMs)} cy={y(endTotal)} r={3} className={`chart-dot ${endTotal >= 1 ? 'up' : 'down'}`} />
    </svg>
  );
}
