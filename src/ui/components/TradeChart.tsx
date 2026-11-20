import { computeIndicators, STRATEGIES, type Trade, type VenueConfig } from '../../engine';
import { signedPct, signedUsd, tone, usd } from '../format';

interface Props {
  trade: Trade;
  venue: VenueConfig;
  onClose: () => void;
}

/** The chart the agent read: price, 9/21 EMAs, entry and exit markers, and RSI underneath. */
export function TradeChart({ trade: t, venue, onClose }: Props) {
  const strat = STRATEGIES[t.strategy];
  const ind = computeIndicators(t.chart);
  const W = 340;
  const H = 170;
  const RH = 46;
  const padL = 4;
  const padR = 36;
  const padY = 8;
  const n = t.chart.length;
  const shown = t.chart.slice(0, t.exitIndex + 1);
  const lo = Math.min(...shown, ...ind.ema21.slice(0, t.exitIndex + 1).filter(Number.isFinite));
  const hi = Math.max(...shown, ...ind.ema21.slice(0, t.exitIndex + 1).filter(Number.isFinite));
  const span = hi - lo || 0.01;
  const x = (i: number) => padL + (i / (n - 1)) * (W - padL - padR);
  const y = (v: number) => padY + (1 - (v - lo) / span) * (H - 2 * padY);
  const ry = (v: number) => 4 + (1 - v / 100) * (RH - 8);
  const line = (vals: number[], fy: (v: number) => number) =>
    vals.slice(0, t.exitIndex + 1).map((v, i) => (Number.isFinite(v) ? `${i && Number.isFinite(vals[i - 1]) ? 'L' : 'M'}${x(i).toFixed(1)},${fy(v).toFixed(1)}` : '')).join('');
  const ticks = [hi, (hi + lo) / 2, lo];
  const usesRsi = t.strategy === 'dip';
  const usesEma = t.strategy === 'trend';
  const usesRange = t.strategy === 'breakout';

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <section className="sheet" role="dialog" aria-modal="true" aria-label={`Chart for $${t.ticker}`} onClick={(e) => e.stopPropagation()}>
        <span className="sheet-handle" aria-hidden="true" />
        <header className="recap-head">
          <div>
            <h2 className="sheet-title">${t.ticker} <span className={tone(t.pnl)}>{signedUsd(t.pnl)}</span></h2>
            <span className="mono tiny muted">{venue.name} · {t.agent.toUpperCase()} · {strat.label} · stake {usd(t.stake)}</span>
          </div>
          <span className="badge">Simulation</span>
        </header>

        <svg className="trade-chart" viewBox={`0 0 ${W} ${H + RH + 10}`} role="img"
          aria-label={`Price chart. Entered at bar ${t.entryIndex}, exited at bar ${t.exitIndex}, ${signedPct(t.pnlPct)}.`}>
          <rect x={x(t.entryIndex)} y={0} width={x(t.exitIndex) - x(t.entryIndex)} height={H} className="hold-zone" />
          {ticks.map((v) => (
            <g key={v}>
              <line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} className="grid" />
              <text x={W - padR + 4} y={y(v) + 3} className="axis">{((v - 1) * 100).toFixed(0)}%</text>
            </g>
          ))}
          {usesRange && <path d={line(ind.high20, y)} className="ind ind-range" />}
          {usesRange && <path d={line(ind.low10, y)} className="ind ind-range" />}
          {(usesEma || usesRange) && <path d={line(ind.ema21, y)} className="ind ind-slow" />}
          {usesEma && <path d={line(ind.ema9, y)} className="ind ind-fast" />}
          {usesRsi && <path d={line(ind.sma20, y)} className="ind ind-slow" />}
          <path d={line(t.chart, y)} className="price" />
          <circle cx={x(t.entryIndex)} cy={y(t.chart[t.entryIndex])} r={4} className="mark-in" />
          <circle cx={x(t.exitIndex)} cy={y(t.chart[t.exitIndex])} r={4} className={`mark-out ${tone(t.pnl)}`} />
          <g transform={`translate(0 ${H + 10})`}>
            <rect x={padL} y={0} width={W - padL - padR} height={RH} className="rsi-box" />
            <line x1={padL} x2={W - padR} y1={ry(70)} y2={ry(70)} className="grid" />
            <line x1={padL} x2={W - padR} y1={ry(30)} y2={ry(30)} className="grid" />
            <text x={W - padR + 4} y={ry(70) + 3} className="axis">70</text>
            <text x={W - padR + 4} y={ry(30) + 3} className="axis">30</text>
            <path d={line(ind.rsi14, ry)} className="ind ind-rsi" />
            <text x={padL + 4} y={11} className="axis">RSI 14</text>
          </g>
        </svg>

        <div className="chart-legend mono tiny">
          <span><i className="lg price-lg" />price</span>
          {usesEma && <span><i className="lg fast-lg" />EMA 9</span>}
          {(usesEma || usesRange) && <span><i className="lg slow-lg" />EMA 21</span>}
          {usesRange && <span><i className="lg range-lg" />20-high / 10-low</span>}
          {usesRsi && <span><i className="lg slow-lg" />SMA 20</span>}
          <span><i className="lg zone-lg" />in the trade</span>
        </div>

        <dl className="why">
          <dt>Why it bought</dt>
          <dd>{t.entryWhy}</dd>
          <dt>Why it sold</dt>
          <dd>{t.exitWhy} · {signedPct(t.pnlPct)} after fees</dd>
          <dt>{strat.label} rules</dt>
          <dd>
            {strat.entryRule}{' '}
            {venue.exits?.ignoreSignalExits
              ? `${venue.name} holds instead of using the sell signal: it exits only at take-profit +${Math.round(t.takeProfitPct * 100)}%, the stop-loss, or after ${t.windowBars} bars.`
              : strat.exitRule}
          </dd>
        </dl>
        <p className="tiny muted">
          Simulated chart: these prices are a random walk, so the pattern before entry can't predict what came after. On real
          charts the same rules can be tested for an edge.
        </p>
        <button className="btn sheet-cta" onClick={onClose}>Close</button>
      </section>
    </div>
  );
}
