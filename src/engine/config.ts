/**
 * Every simulation parameter lives here. Change a value and the engine,
 * the UI and the batch script all pick it up.
 *
 * Values marked ASSUMPTION are not given in the brief. They are guesses that
 * should be checked against paper-bot-simulator-spec.md.
 */

import type { StrategyId } from './strategies';

export type VenueId = string;

export interface VenueExits {
  /** Overrides the global take-profit, e.g. 1.0 = +100%. */
  takeProfitPct?: number;
  /** Overrides the global stop-loss. */
  stopLossPct?: number;
  /** Bars a trade may stay open (default: pricePathSteps). */
  holdBars?: number;
  /** true = ignore the chart technique's sell signal and only exit on TP, SL or the end of the window. */
  ignoreSignalExits?: boolean;
  /** Short label for the UI. */
  label?: string;
}

export interface VenueConfig {
  id: VenueId;
  name: string;
  icon: string;
  /** CSS colour token name, see styles.css (--venue-lime etc.) */
  accent: 'lime' | 'green' | 'blue';
  /** Share of the starting balance given to this venue (shares are normalised). */
  startShare: number;
  /** Short descriptor shown under the venue name. */
  tagline: string;
  /** Optional exit plan that replaces the global one for this venue's agents. */
  exits?: VenueExits;
  /** Each agent reads the chart with one technique (see strategies.ts). */
  agents: { name: string; color: string; strategy: StrategyId }[];
}

export interface SimConfig {
  /** null = new random seed per session. A number makes every session reproducible. */
  seed: number | null;
  startingBalance: number;
  venues: VenueConfig[];
  /** Brief: "~40 trades per venue per day". One session = one simulated day. */
  tradesPerVenuePerSession: number;
  /** Fraction of the venue's current balance staked per trade. */
  positionSizePct: number;
  /** Probability that a trade's token is rugged at some point in its path. */
  rugChance: number;
  /** ASSUMPTION: a rug knocks this fraction off the price, drawn uniformly in [min, max]. */
  rugLossMin: number;
  rugLossMax: number;
  /** Number of price steps in each trade's path. */
  pricePathSteps: number;
  /** Bars of chart history the agents can read before deciding to enter. */
  chartHistoryBars: number;
  /** true = agents only enter when their chart technique signals; false = enter every slot blindly. */
  chartRulesEnabled: boolean;
  /** ASSUMPTION: per-step log-return standard deviation. */
  stepVolatility: number;
  /** ASSUMPTION: per-step expected return. 0 = fair random walk (no edge). */
  stepDrift: number;
  /** ASSUMPTION: charged on entry AND on exit (each side), as a fraction of notional. */
  feeRate: number;
  takeProfitPct: number;
  stopLossPct: number;
  takeProfitEnabled: boolean;
  stopLossEnabled: boolean;
  /** Trades smaller than this are skipped (the venue is effectively broke). */
  minTradeUsd: number;
  /** Simulated length of a session in ms (one day). */
  sessionSimMs: number;
  /** Real seconds a full session takes to play at 1x speed. */
  realSecondsPerSessionAt1x: number;
  speeds: number[];
  /** Number of closed trades shown on the tape. */
  tapeLength: number;
}

export const DEFAULT_CONFIG: SimConfig = {
  seed: null,
  startingBalance: 98,
  venues: [
    {
      id: 'launchpad', name: 'Launchpad', icon: '🚀', accent: 'lime', startShare: 1, tagline: 'sim · graduating coins',
      // Graduation hunters: hold longer and aim for +100% instead of +15%.
      exits: { takeProfitPct: 1.0, holdBars: 120, ignoreSignalExits: true, label: 'hold for +100%' },
      agents: [{ name: 'Scout', color: '#e8d44d', strategy: 'breakout' }, { name: 'Pairs', color: '#3ddc84', strategy: 'trend' }, { name: 'Exec', color: '#c6f135', strategy: 'dip' }],
    },
    {
      id: 'dex', name: 'DEX', icon: '🔁', accent: 'green', startShare: 1, tagline: 'sim · on-chain swaps',
      agents: [{ name: 'Sniper', color: '#ff9f43', strategy: 'breakout' }, { name: 'Curve', color: '#a78bfa', strategy: 'trend' }, { name: 'Exit', color: '#f472b6', strategy: 'dip' }],
    },
    {
      id: 'cex', name: 'CEX', icon: '🏦', accent: 'blue', startShare: 1, tagline: 'sim · order-book spot',
      agents: [{ name: 'Smarts', color: '#38bdf8', strategy: 'breakout' }, { name: 'Trend', color: '#4c9dff', strategy: 'trend' }, { name: 'Router', color: '#60a5fa', strategy: 'dip' }],
    },
  ],
  tradesPerVenuePerSession: 40,
  positionSizePct: 0.06,
  rugChance: 0.08,
  rugLossMin: 0.85,
  rugLossMax: 0.99,
  pricePathSteps: 30,
  chartHistoryBars: 40,
  chartRulesEnabled: true,
  stepVolatility: 0.03,
  stepDrift: 0,
  feeRate: 0.01,
  takeProfitPct: 0.15,
  stopLossPct: 0.07,
  takeProfitEnabled: true,
  stopLossEnabled: true,
  minTradeUsd: 0.01,
  sessionSimMs: 24 * 60 * 60 * 1000,
  realSecondsPerSessionAt1x: 90,
  speeds: [1, 3, 10],
  tapeLength: 8,
};

export function makeConfig(overrides: Partial<SimConfig> = {}): SimConfig {
  return { ...DEFAULT_CONFIG, ...overrides };
}
