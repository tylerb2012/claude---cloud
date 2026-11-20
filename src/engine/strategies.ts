import type { Indicators } from './indicators';

export type StrategyId = 'breakout' | 'trend' | 'dip' | 'blind';

export interface Decision {
  ok: boolean;
  why: string;
}

export interface Strategy {
  id: StrategyId;
  label: string;
  /** Plain-language rules, shown in the UI. */
  entryRule: string;
  exitRule: string;
  /** Called once at the entry bar e. */
  enter(ind: Indicators, e: number): Decision;
  /** Called on each bar i after entry. Returns a reason to exit, or null to hold. */
  exit(ind: Indicators, i: number, e: number): string | null;
}

const f = (n: number) => n.toFixed(3);

export const STRATEGIES: Record<StrategyId, Strategy> = {
  breakout: {
    id: 'breakout',
    label: 'Breakout',
    entryRule: 'Buy when price closes above the highest close of the last 20 bars (breaks resistance).',
    exitRule: 'Sell when price closes below the lowest close of the last 10 bars (trailing support).',
    enter(ind, e) {
      const ok = ind.close[e] > ind.high20[e];
      return { ok, why: ok ? `closed ${f(ind.close[e])} above 20-bar high ${f(ind.high20[e])}` : 'no breakout' };
    },
    exit(ind, i) {
      return ind.close[i] < ind.low10[i] ? `closed below 10-bar low ${f(ind.low10[i])}` : null;
    },
  },
  trend: {
    id: 'trend',
    label: 'EMA cross',
    entryRule: 'Buy when the 9-bar EMA has crossed above the 21-bar EMA in the last 3 bars and price is above the 21 EMA.',
    exitRule: 'Sell when the 9 EMA falls back below the 21 EMA.',
    enter(ind, e) {
      let crossed = false;
      for (let j = e; j > e - 3; j--) {
        if (ind.ema9[j] > ind.ema21[j] && ind.ema9[j - 1] <= ind.ema21[j - 1]) crossed = true;
      }
      const ok = crossed && ind.close[e] > ind.ema21[e];
      return { ok, why: ok ? '9 EMA crossed above 21 EMA' : 'no fresh EMA cross' };
    },
    exit(ind, i) {
      return ind.ema9[i] < ind.ema21[i] ? '9 EMA crossed below 21 EMA' : null;
    },
  },
  dip: {
    id: 'dip',
    label: 'RSI dip',
    entryRule: 'Buy when RSI(14) is under 35 (oversold) and the last bar closed up.',
    exitRule: 'Sell when RSI(14) climbs above 55 or price gets back to the 20-bar average.',
    enter(ind, e) {
      const ok = ind.rsi14[e] < 35 && ind.close[e] > ind.close[e - 1];
      return { ok, why: ok ? `RSI ${ind.rsi14[e].toFixed(0)} oversold, turning up` : `RSI ${ind.rsi14[e].toFixed(0)}, not oversold` };
    },
    exit(ind, i, e) {
      if (ind.rsi14[i] > 55) return `RSI back to ${ind.rsi14[i].toFixed(0)}`;
      if (i > e && ind.close[i] >= ind.sma20[i]) return 'back to 20-bar average';
      return null;
    },
  },
  blind: {
    id: 'blind',
    label: 'No chart',
    entryRule: 'Buy every time, without looking at the chart.',
    exitRule: 'Only take-profit, stop-loss or the end of the window.',
    enter: () => ({ ok: true, why: 'buys without reading the chart' }),
    exit: () => null,
  },
};
