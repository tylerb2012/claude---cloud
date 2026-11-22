import { describe, expect, it } from 'vitest';
import { exchangeGroup, LAB_DEFAULTS, runLab, simulateTrade } from '../desk/lab.js';

const P = { ...LAB_DEFAULTS };
/** Candle series from [o, h, l, c] rows. */
const series = (rows: number[][]) => ({
  t: rows.map((_, i) => i * 3600),
  o: rows.map((r) => r[0]), h: rows.map((r) => r[1]), l: rows.map((r) => r[2]), c: rows.map((r) => r[3]),
});

describe('simulateTrade', () => {
  it('short: takes half at TP1 and the rest at TP2', () => {
    const cd = series([[100, 100.1, 98.9, 99], [99, 99.2, 97.7, 97.8]]);
    const r = simulateTrade(cd, 0, { ...P, holdHours: 2 });
    expect(r.reason).toBe('take-profit 2');
    expect(r.pnl).toBeGreaterThan(0);
  });
  it('short: a jump past the stop fills at the open, worse than the stop', () => {
    const cd = series([[100, 100.2, 99.8, 100], [103, 104, 102.5, 103.5]]);
    const r = simulateTrade(cd, 0, { ...P, holdHours: 2 });
    expect(r.reason).toBe('stop (gapped)');
    // 1,000 notional, 3% adverse fill plus fees
    expect(r.pnl).toBeLessThan(-30);
  });
  it('a jump past liquidation loses the whole margin, never more', () => {
    const cd = series([[100, 100, 100, 100], [120, 121, 119, 120]]);
    const r = simulateTrade(cd, 0, { ...P, leverage: 20, holdHours: 2 });
    expect(r.reason).toBe('liquidated');
    expect(r.pnl).toBeGreaterThanOrEqual(-P.marginUsd - 5);
    expect(r.pnl).toBeLessThanOrEqual(-P.marginUsd);
  });
  it('long mirrors short: a long on a rising path makes what a short makes on the falling mirror', () => {
    const up = series([[100, 101.2, 99.95, 101], [101, 102.4, 100.9, 102.3]]);
    const down = series([[100, 100.05, 98.8, 99], [99, 99.1, 97.6, 97.7]]);
    const long = simulateTrade(up, 0, { ...P, side: 'long', holdHours: 2 });
    const short = simulateTrade(down, 0, { ...P, holdHours: 2 });
    expect(long.reason).toBe(short.reason);
    expect(long.pnl).toBeGreaterThan(0);
    expect(short.pnl).toBeGreaterThan(0);
  });
  it('closes at the end of the hold window when nothing triggers', () => {
    const cd = series([[100, 100.2, 99.8, 100.1], [100.1, 100.3, 99.9, 100]]);
    expect(simulateTrade(cd, 0, { ...P, holdHours: 2 }).reason).toBe('time exit');
  });
});

describe('runLab', () => {
  /** Random-walk market where, optionally, price drops after every alert. */
  function market(edge: number) {
    let x = 12345;
    const rnd = () => ((x = (x * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    const n = 3000;
    const alerts: [number, string, number, string, string][] = [];
    for (let k = 60; k < n - 30; k += 25) alerts.push([k * 3600 - 1800, 'AAA', 5, 'binance', 'binance']);
    const alertBars = new Set(alerts.map((a) => Math.ceil((a[0] + 60) / 3600)));
    const o: number[] = [], h: number[] = [], l: number[] = [], c: number[] = [];
    let p = 100;
    for (let i = 0; i < n; i++) {
      const drift = alertBars.has(i) ? -edge : 0;
      const open = p;
      const close = open * (1 + drift + (rnd() - 0.5) * 0.01);
      o.push(open); c.push(close);
      h.push(Math.max(open, close) * (1 + rnd() * 0.002));
      l.push(Math.min(open, close) * (1 - rnd() * 0.002));
      p = close;
    }
    return { alerts, splitTs: 2200 * 3600, coins: { AAA: { t: o.map((_, i) => i * 3600), o, h, l, c } } };
  }

  it('finds no edge in a market where alerts mean nothing', () => {
    const r = runLab(market(0), {});
    expect(r.pass).toBe(false);
  });

  it('detects a real edge when price really drops after alerts', () => {
    const r = runLab(market(0.03), {});
    expect(r.train.signal.mean).toBeGreaterThan(0);
    expect(r.test.signal.mean).toBeGreaterThan(0);
    expect(r.pass).toBe(true);
  });

  it('filters by coin, exchange and transfer size', () => {
    const d = market(0);
    expect(runLab(d, { coins: ['BBB'] }).trades).toHaveLength(0);
    expect(runLab(d, { exchanges: ['kraken'] }).trades).toHaveLength(0);
    expect(runLab(d, { minUsdM: 10 }).trades).toHaveLength(0);
    expect(runLab(d, {}).trades.length).toBeGreaterThan(50);
  });

  it('is deterministic', () => {
    const d = market(0);
    expect(runLab(d, {}).train.random.mean).toBe(runLab(d, {}).train.random.mean);
  });
});

describe('exchangeGroup', () => {
  it('groups exchange names', () => {
    expect(exchangeGroup('coinbase institutional')).toBe('coinbase');
    expect(exchangeGroup('Binance')).toBe('binance');
    expect(exchangeGroup('some desk')).toBe('other');
  });
});
