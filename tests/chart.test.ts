import { describe, expect, it } from 'vitest';
import { computeIndicators, ema, makeConfig, priorHigh, priorLow, rsi, sma, SimSession, STRATEGIES } from '../src/engine';

describe('indicators', () => {
  it('SMA averages the last n closes', () => {
    expect(sma([1, 2, 3, 4], 2)).toEqual([NaN, 1.5, 2.5, 3.5]);
  });
  it('EMA seeds with the SMA, then weights recent closes more', () => {
    const e = ema([1, 2, 3, 4, 5], 3);
    expect(e[1]).toBeNaN();
    expect(e[2]).toBeCloseTo(2);
    expect(e[3]).toBeCloseTo(4 * 0.5 + 2 * 0.5);
    expect(e[4]).toBeCloseTo(5 * 0.5 + 3 * 0.5);
  });
  it('RSI is 100 in a straight rise, 0 in a straight fall, about 50 when flat-choppy', () => {
    const up = Array.from({ length: 30 }, (_, i) => 1 + i * 0.01);
    expect(rsi(up, 14).at(-1)).toBe(100);
    expect(rsi([...up].reverse(), 14).at(-1)).toBeCloseTo(0);
    const chop = Array.from({ length: 40 }, (_, i) => 1 + (i % 2) * 0.01);
    expect(rsi(chop, 14).at(-1)).toBeGreaterThan(40);
    expect(rsi(chop, 14).at(-1)).toBeLessThan(60);
  });
  it('support/resistance use only earlier bars', () => {
    expect(priorHigh([1, 3, 2, 5], 2)).toEqual([NaN, NaN, 3, 3]);
    expect(priorLow([1, 3, 2, 5], 2)).toEqual([NaN, NaN, 1, 2]);
  });
  it('never looks into the future: appending bars does not change earlier values', () => {
    const a = Array.from({ length: 50 }, (_, i) => 1 + Math.sin(i / 3) * 0.1);
    const short = computeIndicators(a.slice(0, 40));
    const long = computeIndicators([...a.slice(0, 40), 9, 0.1, 5]);
    for (const k of ['ema9', 'ema21', 'sma20', 'rsi14', 'high20', 'low10'] as const) {
      expect(long[k].slice(0, 40)).toEqual(short[k]);
    }
  });
});

describe('strategies', () => {
  const flatThen = (tail: number[]) => computeIndicators([...Array(30).fill(1), ...tail]);
  it('breakout buys a close above the 20-bar high and sells below the 10-bar low', () => {
    const ind = flatThen([1.05, 1.02, 0.9]);
    expect(STRATEGIES.breakout.enter(ind, 30).ok).toBe(true);
    expect(STRATEGIES.breakout.enter(ind, 29).ok).toBe(false);
    expect(STRATEGIES.breakout.exit(ind, 32, 30)).toMatch(/below 10-bar low/);
  });
  it('RSI dip buys oversold that is turning up', () => {
    const down = Array.from({ length: 30 }, (_, i) => 1 - i * 0.01);
    const ind = computeIndicators([...down, down.at(-1)! + 0.002]);
    expect(STRATEGIES.dip.enter(ind, 30).ok).toBe(true);
    expect(STRATEGIES.dip.enter(computeIndicators(Array(31).fill(1)), 30).ok).toBe(false);
  });
  it('EMA cross buys right after the fast EMA crosses above the slow one', () => {
    const closes = [...Array.from({ length: 30 }, (_, i) => 1.2 - i * 0.005), 1.08, 1.1, 1.13, 1.16, 1.19];
    const ind = computeIndicators(closes);
    const e = ind.ema9.findIndex((v, i) => i > 0 && v > ind.ema21[i] && ind.ema9[i - 1] <= ind.ema21[i - 1]);
    expect(e).toBeGreaterThan(0);
    expect(STRATEGIES.trend.enter(ind, e).ok).toBe(true);
  });
});

describe('chart rules in the session', () => {
  it('agents pass on slots with no signal, so they trade less', () => {
    const on = new SimSession(makeConfig(), 3);
    on.runToEnd();
    const off = new SimSession(makeConfig({ chartRulesEnabled: false }), 3);
    off.runToEnd();
    expect(off.tradeCount).toBe(120);
    expect(on.tradeCount).toBeLessThan(120);
    expect(on.tradeCount + on.venues.reduce((n, v) => n + v.passed, 0)).toBe(120);
  });
  it('every trade records why it entered and exited, and the chart it read', () => {
    const s = new SimSession(makeConfig(), 4);
    s.runToEnd();
    for (const t of s.trades) {
      expect(t.entryWhy.length).toBeGreaterThan(0);
      expect(t.exitWhy.length).toBeGreaterThan(0);
      expect(t.chart[t.entryIndex]).toBeCloseTo(1);
      expect(t.exitIndex).toBe(t.entryIndex + t.exitStep);
    }
  });
});
