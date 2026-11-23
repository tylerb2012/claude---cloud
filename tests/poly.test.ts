import { describe, expect, it } from 'vitest';
import { calibration, decide, DEFAULTS, fillFromAsks, Ledger, slotStart, summarize, takerFee } from '../poly/engine.js';

const book = (ask: number, size = 10000) => ({ asks: [{ p: ask, s: size }], bids: [{ p: ask - 0.01, s: size }] });
const snap = (up: number, down: number, elapsed = 120) => ({ start: 1000 * 300, now: 1000 * 300 + elapsed, books: { Up: book(up), Down: book(down) } });

describe('underdog paper trader', () => {
  it('finds the 5-minute window', () => {
    expect(slotStart(1795440946.5)).toBe(1795440900);
    expect(slotStart(1795440900)).toBe(1795440900);
  });

  it('buys the cheaper side only inside the price band', () => {
    const d = decide(snap(0.74, 0.27));
    expect(d.action).toBe('buy');
    expect(d.side).toBe('Down');
    expect(decide(snap(0.12, 0.9)).action).toBe('skip'); // underdog too cheap
    expect(decide(snap(0.45, 0.56)).action).toBe('skip'); // too close to a coin flip
  });

  it('respects the entry window', () => {
    expect(decide(snap(0.74, 0.27, 10)).reason).toBe('too early');
    expect(decide(snap(0.74, 0.27, 290)).reason).toBe('too late');
  });

  it('spends the stake including the fee and never pays above the limit', () => {
    const asks = [{ p: 0.25, s: 400 }, { p: 0.26, s: 400 }, { p: 0.4, s: 99999 }];
    const f = fillFromAsks(asks, 500, 0.27)!;
    expect(f.shares).toBeCloseTo(800); // ran out of book at the limit before the stake
    expect(f.cost).toBeCloseTo(204);
    const g = fillFromAsks([{ p: 0.25, s: 99999 }], 500, 0.27)!;
    expect(g.cost + g.fee).toBeCloseTo(500);
  });

  it('charges the fee formula and nothing when the rate is 0', () => {
    expect(takerFee(100, 0.5)).toBeCloseTo(100 * 0.5 * 0.25 * 0.0625);
    expect(takerFee(100, 0.5, { ...DEFAULTS, feeRate: 0 })).toBe(0);
  });

  it('settles: $1 a share on a win, nothing on a loss, cash adds up', () => {
    const L = new Ledger({ ...DEFAULTS, feeRate: 0, stake: 250 });
    const m = (start: number) => ({ slug: `btc-updown-5m-${start}`, title: 't', start });
    L.buy(m(300), decide(snap(0.75, 0.25), L.cfg), 1);
    L.buy(m(600), decide(snap(0.25, 0.75), L.cfg), 2);
    expect(L.cash).toBeCloseTo(9500);
    const w = L.settle('btc-updown-5m-300', 'Down')!;
    const l = L.settle('btc-updown-5m-600', 'Down')!;
    expect(w.pnl).toBeCloseTo(750); // 1000 shares at 25c
    expect(l.pnl).toBeCloseTo(-250);
    expect(L.cash).toBeCloseTo(10500);
    const s = L.stats();
    expect(s.hitRate).toBe(0.5);
    expect(s.breakeven).toBeCloseTo(0.25);
    expect(s.equity).toBeCloseTo(10500);
  });

  it('survives a JSON round trip', () => {
    const L = new Ledger(DEFAULTS);
    L.buy({ slug: 'x', title: 't', start: 300 }, decide(snap(0.7, 0.3)), 1);
    const back = new Ledger(DEFAULTS, JSON.parse(JSON.stringify(L.toJSON())));
    expect(back.cash).toBe(L.cash);
    expect(back.open).toHaveLength(1);
    expect(back.seen.has('x')).toBe(true);
  });

  it('tracks drawdown, losing streaks and price buckets', () => {
    const t = (won: boolean, avg: number) => ({ won, avg, shares: 100, cost: 100 * avg, fee: 0, pnl: won ? 100 - 100 * avg : -100 * avg });
    const trades = [t(false, 0.22), t(false, 0.23), t(false, 0.31), t(true, 0.32)];
    const s = summarize(trades, 1000);
    expect(s.worstLosingStreak).toBe(3);
    expect(s.maxDrawdown).toBeCloseTo(76);
    const c = calibration(trades);
    expect(c.map((b) => b.n)).toEqual([2, 2]);
    expect(c[1].hitRate).toBe(0.5);
  });
});
