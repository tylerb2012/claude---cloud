import { describe, expect, it } from 'vitest';
import { createRng, findExit, generatePricePath, makeConfig, settle, SimSession, type PricePath } from '../src/engine';

const rules = { takeProfitEnabled: true, stopLossEnabled: true, takeProfitPct: 0.15, stopLossPct: 0.07 };
const path = (prices: number[], rugStep: number | null = null): PricePath => ({ history: [1], prices: [1, ...prices], rugStep });

describe('settle: P&L and fees', () => {
  it('charges the fee on entry and exit', () => {
    const s = settle(10, 1.2, 0.01);
    expect(s.entryFee).toBeCloseTo(0.1);
    expect(s.exitValue).toBeCloseTo(9.9 * 1.2);
    expect(s.exitFee).toBeCloseTo(0.1188);
    expect(s.pnl).toBeCloseTo(9.9 * 1.2 * 0.99 - 10);
  });
  it('a flat trade loses exactly the fees', () => {
    const s = settle(10, 1, 0.01);
    expect(s.pnl).toBeCloseTo(-(0.1 + 0.099));
  });
  it('zero fee and flat price is break-even', () => {
    expect(settle(10, 1, 0).pnl).toBeCloseTo(0);
  });
  it('can never lose more than the stake', () => {
    expect(settle(10, 0, 0.01).pnl).toBeCloseTo(-10);
    expect(settle(10, -5, 0.01).pnl).toBeCloseTo(-10);
  });
});

describe('findExit: take-profit and stop-loss', () => {
  it('exits on take-profit at the first step at or above +15%', () => {
    const e = findExit(path([1.05, 1.16, 1.3]), rules);
    expect(e).toMatchObject({ reason: 'take-profit', exitStep: 2, exitPrice: 1.16 });
  });
  it('exits on stop-loss at the first step at or below -7%', () => {
    const e = findExit(path([0.98, 0.92, 0.5]), rules);
    expect(e).toMatchObject({ reason: 'stop-loss', exitStep: 2, exitPrice: 0.92 });
  });
  it('holds to the end when no rule triggers', () => {
    const e = findExit(path([1.02, 0.97, 1.01]), rules);
    expect(e).toMatchObject({ reason: 'time', exitStep: 3, exitPrice: 1.01 });
  });
  it('ignores take-profit when it is turned off', () => {
    const e = findExit(path([1.2, 1.3]), { ...rules, takeProfitEnabled: false });
    expect(e).toMatchObject({ reason: 'time', exitPrice: 1.3 });
  });
  it('ignores stop-loss when it is turned off', () => {
    const e = findExit(path([0.8, 0.9]), { ...rules, stopLossEnabled: false });
    expect(e).toMatchObject({ reason: 'time', exitPrice: 0.9 });
  });
});

describe('rug pulls', () => {
  it('a rug gaps through the stop-loss and fills at the gapped price', () => {
    const e = findExit(path([1.02, 0.05, 0.05], 2), rules);
    expect(e).toMatchObject({ reason: 'rug', exitStep: 2, exitPrice: 0.05, rugged: true });
    expect(settle(10, e.exitPrice, 0.01).pnl).toBeLessThan(-9);
  });
  it('a take-profit before the rug escapes it', () => {
    const e = findExit(path([1.2, 0.05], 2), rules);
    expect(e.reason).toBe('take-profit');
  });
  it('rug frequency matches rugChance', () => {
    const cfg = makeConfig({ rugChance: 0.08 });
    const rng = createRng(42);
    let n = 0;
    for (let i = 0; i < 20000; i++) if (generatePricePath(cfg, rng).rugStep !== null) n++;
    expect(n / 20000).toBeGreaterThan(0.07);
    expect(n / 20000).toBeLessThan(0.09);
  });
  it('rugChance 0 never rugs', () => {
    const s = new SimSession(makeConfig({ rugChance: 0 }), 1);
    s.runToEnd();
    expect(s.trades.some((t) => t.reason === 'rug')).toBe(false);
  });
});

describe('SimSession', () => {
  it('balance never goes below zero, even with brutal settings', () => {
    const cfg = makeConfig({ positionSizePct: 1, rugChance: 1, rugLossMin: 1, rugLossMax: 1, stopLossEnabled: false });
    for (let seed = 1; seed <= 20; seed++) {
      const s = new SimSession(cfg, seed);
      s.runToEnd();
      for (const v of s.venues) expect(v.balance).toBeGreaterThanOrEqual(0);
      for (const h of s.history) expect(h.total).toBeGreaterThanOrEqual(0);
    }
  });
  it('fills every scheduled slot per venue: a trade, or a pass when the chart gives no signal', () => {
    const blind = new SimSession(makeConfig({ chartRulesEnabled: false }), 7);
    blind.runToEnd();
    for (const v of blind.venues) expect(v.trades).toBe(40);
    const chart = new SimSession(makeConfig(), 7);
    chart.runToEnd();
    expect(chart.done).toBe(true);
    for (const v of chart.venues) expect(v.trades + v.passed).toBe(40);
  });
  it('balances reconcile: start + sum of trade P&L = final total', () => {
    const s = new SimSession(makeConfig(), 9);
    s.runToEnd();
    const sum = s.trades.reduce((a, t) => a + t.pnl, 0);
    expect(s.total).toBeCloseTo(98 + sum, 9);
  });
  it('the same seed reproduces the same run, whatever the playback steps', () => {
    const a = new SimSession(makeConfig(), 123);
    a.runToEnd();
    const b = new SimSession(makeConfig(), 123);
    for (let t = 0; t <= b.cfg.sessionSimMs; t += 60_000) b.advanceTo(t);
    b.runToEnd();
    expect(b.trades).toEqual(a.trades);
  });
  it('changing a config parameter changes the results', () => {
    const base = new SimSession(makeConfig(), 5);
    base.runToEnd();
    const alt = new SimSession(makeConfig({ feeRate: 0.03 }), 5);
    alt.runToEnd();
    expect(alt.total).toBeLessThan(base.total);
  });
  it('default settings lose money on average', () => {
    let sum = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const s = new SimSession(makeConfig(), seed);
      s.runToEnd();
      sum += s.total;
    }
    expect(sum / 200).toBeLessThan(98);
  });
});
