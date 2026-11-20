import type { SimConfig, VenueId } from './config';
import { createRng, type Rng } from './rng';
import { findExit, generatePricePath, settle, type ExitReason } from './trade';

export interface Trade {
  id: number;
  simTimeMs: number;
  venueId: VenueId;
  agent: string;
  agentIndex: number;
  ticker: string;
  stake: number;
  fees: number;
  pnl: number;
  pnlPct: number;
  reason: ExitReason;
  exitStep: number;
}

export interface AgentState {
  name: string;
  trades: number;
  wins: number;
  pnl: number;
  lastTradeId: number | null;
}

export interface VenueState {
  id: VenueId;
  startBalance: number;
  balance: number;
  trades: number;
  wins: number;
  skipped: number;
  agents: AgentState[];
  lastTradeId: number | null;
}

export interface HistoryPoint {
  simTimeMs: number;
  total: number;
  /** Balance per venue, same order as config.venues. */
  venues: number[];
}

interface Scheduled {
  simTimeMs: number;
  venueIndex: number;
}

export interface RuleState {
  takeProfitEnabled: boolean;
  stopLossEnabled: boolean;
}

const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

/**
 * One simulated day. Pure logic, no timers and no DOM: the UI calls advanceTo()
 * and the batch script calls runToEnd().
 *
 * Determinism: the trade schedule is drawn at construction, and each trade's
 * price path is drawn in schedule order, so a seed gives the same paths whatever
 * the playback speed. Exit rules only decide where on the path a trade exits.
 */
export class SimSession {
  readonly cfg: SimConfig;
  readonly seed: number;
  readonly startingBalance: number;
  venues: VenueState[];
  trades: Trade[] = [];
  history: HistoryPoint[] = [];
  simTimeMs = 0;
  rules: RuleState;
  private schedule: Scheduled[];
  private cursor = 0;
  private rng: Rng;

  constructor(cfg: SimConfig, seed: number, rules?: Partial<RuleState>) {
    this.cfg = cfg;
    this.seed = seed;
    this.rng = createRng(seed);
    this.startingBalance = cfg.startingBalance;
    this.rules = {
      takeProfitEnabled: rules?.takeProfitEnabled ?? cfg.takeProfitEnabled,
      stopLossEnabled: rules?.stopLossEnabled ?? cfg.stopLossEnabled,
    };
    const shareTotal = cfg.venues.reduce((s, v) => s + v.startShare, 0);
    this.venues = cfg.venues.map((v) => {
      const start = (cfg.startingBalance * v.startShare) / shareTotal;
      return {
        id: v.id,
        startBalance: start,
        balance: start,
        trades: 0,
        wins: 0,
        skipped: 0,
        lastTradeId: null,
        agents: v.agents.map((a) => ({ name: a.name, trades: 0, wins: 0, pnl: 0, lastTradeId: null })),
      };
    });
    this.schedule = [];
    cfg.venues.forEach((_, venueIndex) => {
      for (let i = 0; i < cfg.tradesPerVenuePerSession; i++) {
        this.schedule.push({ simTimeMs: this.rng.next() * cfg.sessionSimMs, venueIndex });
      }
    });
    this.schedule.sort((a, b) => a.simTimeMs - b.simTimeMs);
    this.history.push(this.snapshot(0));
  }

  get total(): number {
    return this.venues.reduce((s, v) => s + v.balance, 0);
  }

  private snapshot(simTimeMs: number): HistoryPoint {
    return { simTimeMs, total: this.total, venues: this.venues.map((v) => v.balance) };
  }

  get done(): boolean {
    return this.cursor >= this.schedule.length;
  }

  get scheduledTrades(): number {
    return this.schedule.length;
  }

  get wins(): number {
    return this.venues.reduce((s, v) => s + v.wins, 0);
  }

  get tradeCount(): number {
    return this.venues.reduce((s, v) => s + v.trades, 0);
  }

  /** Executes every scheduled trade up to simTimeMs. Returns the trades that closed. */
  advanceTo(simTimeMs: number): Trade[] {
    const closed: Trade[] = [];
    const target = Math.min(simTimeMs, this.cfg.sessionSimMs);
    while (this.cursor < this.schedule.length && this.schedule[this.cursor].simTimeMs <= target) {
      const t = this.execute(this.schedule[this.cursor]);
      this.cursor++;
      if (t) closed.push(t);
    }
    this.simTimeMs = this.done ? this.cfg.sessionSimMs : target;
    return closed;
  }

  runToEnd(): void {
    this.advanceTo(this.cfg.sessionSimMs);
  }

  private execute(s: Scheduled): Trade | null {
    const cfg = this.cfg;
    const venue = this.venues[s.venueIndex];
    // Draw everything from the rng first so the sequence doesn't depend on balances or rules.
    const path = generatePricePath(cfg, this.rng);
    const agentIndex = this.rng.int(venue.agents.length);
    const ticker = Array.from({ length: 3 + this.rng.int(2) }, () => LETTERS[this.rng.int(LETTERS.length)]).join('');

    const stake = venue.balance * cfg.positionSizePct;
    if (stake < cfg.minTradeUsd) {
      venue.skipped++;
      return null;
    }
    const exit = findExit(path, {
      ...this.rules,
      takeProfitPct: cfg.takeProfitPct,
      stopLossPct: cfg.stopLossPct,
    });
    const st = settle(stake, exit.exitPrice, cfg.feeRate);
    venue.balance = Math.max(0, venue.balance + st.pnl);

    const trade: Trade = {
      id: this.trades.length + 1,
      simTimeMs: s.simTimeMs,
      venueId: venue.id,
      agent: venue.agents[agentIndex].name,
      agentIndex,
      ticker,
      stake,
      fees: st.entryFee + st.exitFee,
      pnl: st.pnl,
      pnlPct: st.pnl / stake,
      reason: exit.reason,
      exitStep: exit.exitStep,
    };
    venue.trades++;
    if (st.pnl > 0) venue.wins++;
    venue.lastTradeId = trade.id;
    const agent = venue.agents[agentIndex];
    agent.trades++;
    agent.pnl += st.pnl;
    if (st.pnl > 0) agent.wins++;
    agent.lastTradeId = trade.id;
    this.trades.push(trade);
    this.history.push(this.snapshot(s.simTimeMs));
    return trade;
  }
}
