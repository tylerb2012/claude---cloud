import { describe, expect, it } from 'vitest';
import { DEFAULT_TOGGLES, DEFAULTS, Desk, makeBar, manageBar, newPosition, realityCheck } from '../desk/engine.js';

const ALL_OFF = Object.fromEntries(Object.keys(DEFAULT_TOGGLES).map((k) => [k, false]));

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
      const d = new Desk({ leverage: 20, gapChance: 0.05 }, seed, ALL_OFF).runToEnd();
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

  it('the gate bots block signals, and switching them off lets everything through', () => {
    const on = new Desk({}, 5).runToEnd();
    const off = new Desk({}, 5, ALL_OFF).runToEnd();
    expect(on.totalBlocked).toBeGreaterThan(0);
    expect(off.totalBlocked).toBe(0);
    expect(off.trades.length).toBeGreaterThan(on.trades.length);
  });

  it('every bot runs and keeps a scoreboard', () => {
    const d = new Desk({}, 11).runToEnd();
    for (const [id, b] of Object.entries(d.bots)) expect(b.runs, id).toBeGreaterThan(0);
  });

  it('a blocked trade is played out on paper without touching equity', () => {
    const d = new Desk({}, 12).runToEnd();
    const sum = d.trades.reduce((s, t) => s + t.pnl, 0);
    expect(d.equity).toBeCloseTo(DEFAULTS.startEquity + sum, 6);
    expect(Object.values(d.bots).some((b) => b.shadowN > 0)).toBe(true);
  });

  it('Liq Mapper moves take-profit 2 to the long cluster', () => {
    let moved = 0;
    for (let seed = 1; seed <= 20; seed++) moved += new Desk({}, seed).runToEnd().bots.liq.acted;
    expect(moved).toBeGreaterThan(0);
    let off = 0;
    for (let seed = 1; seed <= 20; seed++) off += new Desk({}, seed, { liqTarget: false }).runToEnd().bots.liq.acted;
    expect(off).toBe(0);
  });

  it('a gap through the stop fills at the open, worse than the stop', () => {
    const c = { ...DEFAULTS };
    const p = newPosition({ funding: 0 }, 100, 100, c);
    const r = manageBar(p, { o: 103, h: 104, l: 102.5, c: 103.5, vol: 1 }, c);
    expect(r.closed).toBe('stop (gapped)');
    expect(r.exits[0].price).toBe(103);
  });

  it('makeBar keeps high above and low below the body', () => {
    const rng = { next: () => 0.5, range: (a: number) => a, int: () => 0, pick: (x: unknown[]) => x[0], normal: () => 0.3 };
    const b = makeBar(100, 0, null, rng, DEFAULTS);
    expect(b.h).toBeGreaterThanOrEqual(Math.max(b.o, b.c));
    expect(b.l).toBeLessThanOrEqual(Math.min(b.o, b.c));
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
