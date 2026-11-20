/**
 * Every simulation parameter lives here. Change a value and the engine,
 * the UI and the batch script all pick it up.
 *
 * Values marked ASSUMPTION are not given in the brief. They are guesses that
 * should be checked against paper-bot-simulator-spec.md.
 */

export type VenueId = string;

export interface VenueConfig {
  id: VenueId;
  name: string;
  icon: string;
  /** CSS colour token name, see styles.css (--venue-lime etc.) */
  accent: 'lime' | 'green' | 'blue';
  /** Share of the starting balance given to this venue (shares are normalised). */
  startShare: number;
  agents: string[];
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
    { id: 'launchpad', name: 'Launchpad', icon: '🚀', accent: 'lime', startShare: 1, agents: ['Sniper', 'Momentum', 'Scout'] },
    { id: 'dex', name: 'DEX', icon: '🔁', accent: 'green', startShare: 1, agents: ['Arb', 'Trend', 'Dip'] },
    { id: 'cex', name: 'CEX', icon: '🏦', accent: 'blue', startShare: 1, agents: ['Breakout', 'Scalper', 'Swing'] },
  ],
  tradesPerVenuePerSession: 40,
  positionSizePct: 0.06,
  rugChance: 0.08,
  rugLossMin: 0.85,
  rugLossMax: 0.99,
  pricePathSteps: 30,
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
