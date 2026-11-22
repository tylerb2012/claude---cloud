import { describe, expect, it } from 'vitest';
import { DEFAULTS, Desk, realityCheck } from '../desk/engine.js';

describe('trading desk engine', () => {
  it('is reproducible from a seed', () => {
    const a = new Desk({}, 42).runToEnd();
    const b = new Desk({}, 42).runToEnd();
    expect(a.equity).toBe(b.equity);
    expect(a.trades.map((t) => t.pnl)).toEqual(b.trades.map((t) => t.pnl));
  });

  it('never loses more than the margin on a trade, even when liquidated at 20x', () => {
    let liqs = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const d = new Desk({ leverage: 20, gapChance: 0.05 }, seed, { squeezeGate: false, newsFilter: false }).runToEnd();
      liqs += d.liquidations;
      expect(d.equity).toBeGreaterThanOrEqual(0);
      for (const t of d.trades) {
        const margin = (t.pnl - 0) / t.roe;
        expect(t.pnl).toBeGreaterThanOrEqual(-margin - t.fees - 1e-9 - Math.abs(t.funding));
      }
    }
    expect(liqs).toBeGreaterThan(0);
  });

  it('equity history matches the sum of trade P&L', () => {
    const d = new Desk({}, 9).runToEnd();
    const sum = d.trades.reduce((s, t) => s + t.pnl, 0);
    expect(d.equity).toBeCloseTo(DEFAULTS.startEquity + sum, 6);
  });

  it('the squeeze gate and news filter block risky signals', () => {
    const on = new Desk({}, 5).runToEnd();
    const off = new Desk({}, 5, { squeezeGate: false, newsFilter: false }).runToEnd();
    expect(on.blocked.squeeze + on.blocked.news).toBeGreaterThan(0);
    expect(off.blocked.squeeze + off.blocked.news).toBe(0);
    expect(off.trades.length).toBeGreaterThan(on.trades.length);
  });

  it('with no assumed edge the desk loses money on average', () => {
    expect(realityCheck({}, {}, 300).avg).toBeLessThan(DEFAULTS.startEquity);
    expect(realityCheck({ leverage: 20 }, {}, 300).avg).toBeLessThan(DEFAULTS.startEquity);
  });

  it('a large assumed edge makes money, so the edge slider really matters', () => {
    expect(realityCheck({ edgePerBar: 0.0005 }, {}, 300).avg).toBeGreaterThan(DEFAULTS.startEquity);
  });

  it('takes profit in two steps and moves the stop to breakeven after the first', () => {
    let sawTwoStep = false;
    for (let seed = 1; seed <= 50 && !sawTwoStep; seed++) {
      const d = new Desk({ edgePerBar: 0.001 }, seed).runToEnd();
      sawTwoStep = d.trades.some((t) => t.reason === 'take-profit 2');
    }
    expect(sawTwoStep).toBe(true);
  });
});
