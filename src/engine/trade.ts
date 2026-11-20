import type { SimConfig } from './config';
import type { Rng } from './rng';

export type ExitReason = 'take-profit' | 'stop-loss' | 'rug' | 'signal' | 'time';

export interface PricePath {
  /** Chart the agent sees before entry: chartHistoryBars + 1 closes, the last one = 1 (the entry price). */
  history: number[];
  /** prices[0] = 1 (entry). prices[i] for i = 1..steps. */
  prices: number[];
  /** Step at which the rug happened, or null. */
  rugStep: number | null;
}

/** Generates a price path relative to an entry price of 1. Uses only the rng, never the exit rules. */
export function generatePricePath(cfg: SimConfig, rng: Rng): PricePath {
  const steps = cfg.pricePathSteps;
  const rugged = rng.next() < cfg.rugChance;
  const rugStep = rugged ? 1 + rng.int(steps) : null;
  const rugLoss = rugged ? rng.range(cfg.rugLossMin, cfg.rugLossMax) : 0;
  const sigma = cfg.stepVolatility;
  const step = () => Math.exp(Math.log(1 + cfg.stepDrift) + sigma * rng.normal() - (sigma * sigma) / 2);
  // history: same random walk, rescaled so it ends exactly at the entry price of 1
  const raw = [1];
  for (let i = 0; i < cfg.chartHistoryBars; i++) raw.push(raw[raw.length - 1] * step());
  const last = raw[raw.length - 1];
  const history = raw.map((v) => v / last);
  const prices = [1];
  let p = 1;
  for (let i = 1; i <= steps; i++) {
    // log-normal step; the -sigma^2/2 term makes the expected price change exactly stepDrift
    p *= step();
    if (i === rugStep) p *= 1 - rugLoss;
    prices.push(p);
  }
  return { history, prices, rugStep };
}

export interface ExitRules {
  takeProfitEnabled: boolean;
  stopLossEnabled: boolean;
  takeProfitPct: number;
  stopLossPct: number;
}

export interface ExitResult {
  exitStep: number;
  /** Plain-language reason, e.g. "closed below 10-bar low". */
  why: string;
  /** Exit price relative to entry (1 = flat). */
  exitPrice: number;
  reason: ExitReason;
  rugged: boolean;
}

/**
 * Walks the path and exits on the first step where a rule triggers.
 * Fills happen at that step's price, not at the threshold: a rug that gaps
 * straight through the stop-loss is filled at the gapped price.
 */
export function findExit(path: PricePath, rules: ExitRules, signal?: (step: number) => string | null): ExitResult {
  const { prices, rugStep } = path;
  const last = prices.length - 1;
  const pct = (p: number) => `${p >= 1 ? '+' : ''}${((p - 1) * 100).toFixed(1)}%`;
  for (let i = 1; i <= last; i++) {
    const p = prices[i];
    const ruggedNow = rugStep !== null && i >= rugStep;
    if (rules.takeProfitEnabled && p >= 1 + rules.takeProfitPct) {
      return { exitStep: i, exitPrice: p, reason: 'take-profit', rugged: ruggedNow, why: `take-profit hit at ${pct(p)}` };
    }
    if (rules.stopLossEnabled && p <= 1 - rules.stopLossPct) {
      return {
        exitStep: i, exitPrice: p, reason: ruggedNow ? 'rug' : 'stop-loss', rugged: ruggedNow,
        why: ruggedNow ? `rug pull, filled at ${pct(p)}` : `stop-loss hit, filled at ${pct(p)}`,
      };
    }
    const s = signal?.(i);
    if (s) return { exitStep: i, exitPrice: p, reason: ruggedNow ? 'rug' : 'signal', rugged: ruggedNow, why: ruggedNow ? `rugged, then ${s}` : s };
  }
  const rugged = rugStep !== null;
  return { exitStep: last, exitPrice: prices[last], reason: rugged ? 'rug' : 'time', rugged, why: rugged ? 'rugged, held to the end' : 'end of the trade window' };
}

export interface Settlement {
  stake: number;
  entryFee: number;
  exitValue: number;
  exitFee: number;
  proceeds: number;
  pnl: number;
}

/**
 * P&L for a stake of `stake` dollars.
 * Entry fee comes off the stake before buying; exit fee comes off the sale value.
 * proceeds >= 0 always, so a trade can never lose more than its stake.
 */
export function settle(stake: number, exitPrice: number, feeRate: number): Settlement {
  const entryFee = stake * feeRate;
  const units = (stake - entryFee) / 1; // entry price normalised to 1
  const exitValue = units * Math.max(0, exitPrice);
  const exitFee = exitValue * feeRate;
  const proceeds = exitValue - exitFee;
  return { stake, entryFee, exitValue, exitFee, proceeds, pnl: proceeds - stake };
}
