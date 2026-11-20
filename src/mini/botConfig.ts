/** Turns the Bot tab's strategy and risk picks into an engine config. */
import { DEFAULT_CONFIG, type SimConfig, type StrategyId, type VenueExits } from '../engine';

export type BotStrategy = 'momentum' | 'breakout' | 'dip' | 'runner' | 'newpairs';
export type Risk = 'conservative' | 'balanced' | 'aggressive';

export const BOT_STRATEGIES: { id: BotStrategy; name: string; blurb: string; icon: string }[] = [
  { id: 'momentum', name: 'Momentum', blurb: 'Rides a trend once the fast average crosses above the slow one.', icon: '⚡' },
  { id: 'breakout', name: 'Breakout', blurb: 'Buys a close above the recent range high.', icon: '🚀' },
  { id: 'dip', name: 'Dip buyer', blurb: 'Buys oversold pullbacks (RSI under 35) as they turn up.', icon: '🪂' },
  { id: 'runner', name: 'Runner', blurb: 'Breakout entry, then a trailing stop with no profit cap.', icon: '🏃' },
  { id: 'newpairs', name: 'New pairs', blurb: 'Graduation hunting: holds up to 120 bars for +100%.', icon: '🌱' },
];

export const RISKS: { id: Risk; name: string; positionSizePct: number; stopLossPct: number }[] = [
  { id: 'conservative', name: 'Conservative', positionSizePct: 0.03, stopLossPct: 0.05 },
  { id: 'balanced', name: 'Balanced', positionSizePct: 0.06, stopLossPct: 0.07 },
  { id: 'aggressive', name: 'Aggressive', positionSizePct: 0.12, stopLossPct: 0.12 },
];

const ENGINE_STRATEGY: Record<BotStrategy, StrategyId> = {
  momentum: 'trend',
  breakout: 'breakout',
  dip: 'dip',
  runner: 'breakout',
  newpairs: 'blind',
};

const EXITS: Partial<Record<BotStrategy, VenueExits>> = {
  runner: { takeProfitPct: 99, holdBars: 60, label: 'trailing stop, no cap' },
  newpairs: { takeProfitPct: 1, holdBars: 120, ignoreSignalExits: true, label: 'hold for +100%' },
};

export function makeBotConfig(strategy: BotStrategy, risk: Risk, base: SimConfig = DEFAULT_CONFIG): SimConfig {
  const r = RISKS.find((x) => x.id === risk)!;
  return {
    ...base,
    positionSizePct: r.positionSizePct,
    stopLossPct: r.stopLossPct,
    venues: base.venues.map((v) => ({
      ...v,
      exits: EXITS[strategy],
      agents: v.agents.map((a) => ({ ...a, strategy: ENGINE_STRATEGY[strategy] })),
    })),
  };
}
