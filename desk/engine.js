/**
 * Paper trading desk engine. Simulated perpetual-futures shorts driven by a
 * pipeline of agents. Prices are a random walk; nothing here reads a real
 * market or places a real order.
 *
 * Kept free of DOM and imports so the page can inline it and tests can import it.
 */

export const ASSETS = [
  { sym: 'SOL', price: 71.3, dec: 2 },
  { sym: 'ETH', price: 2410, dec: 1 },
  { sym: 'BTC', price: 64200, dec: 0 },
  { sym: 'XRP', price: 0.9947, dec: 4 },
  { sym: 'DOGE', price: 0.1421, dec: 4 },
  { sym: 'AVAX', price: 23.4, dec: 2 },
];

const ENTITIES = ['Fund', 'VC wallet', 'Team wallet', 'Market maker', 'Early investor', 'Dev wallet', 'Treasury'];
const EXCHANGES = ['an exchange', 'a CEX deposit address', 'an OTC desk'];

export const DEFAULTS = {
  startEquity: 1000,
  leverage: 10,
  /** Share of equity put up as margin per trade (isolated margin). */
  marginPct: 0.1,
  /** Post-only entries and take-profits pay maker; stops, time exits and liquidations pay taker. */
  makerFee: 0.00015,
  takerFee: 0.00045,
  /** Per-bar price volatility. */
  barVol: 0.003,
  /**
   * Assumed edge of the wallet-monitor signal: per-bar downward drift while a short is open.
   * 0 = the signal predicts nothing. This is an assumption to explore, never a measured fact.
   */
  edgePerBar: 0,
  /** Chance per bar of a price gap in either direction. */
  gapChance: 0.012,
  gapMin: 0.006,
  gapMax: 0.05,
  /** Share of signals where shorts are already crowded (negative funding, high open interest). */
  crowdedRate: 0.3,
  /** Extra chance per bar of an upward squeeze gap when shorts are crowded. */
  squeezeChance: 0.03,
  /** Share of signals with a risky headline pending. */
  newsRiskRate: 0.12,
  newsGapChance: 0.03,
  tp1: 0.01,
  tp2: 0.022,
  stop: 0.009,
  trail: 0.009,
  maxBars: 60,
  maintenance: 0.005,
  fundingSd: 0.00002,
  signalsPerSession: 40,
  idleMin: 3,
  idleMax: 10,
  historyBars: 40,
};

export function createRng(seed) {
  let a = seed >>> 0;
  let spare = null;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (lo, hi) => lo + (hi - lo) * next(),
    int: (n) => Math.floor(next() * n),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    normal() {
      if (spare !== null) { const s = spare; spare = null; return s; }
      let u = 0;
      while (u === 0) u = next();
      const v = next();
      const r = Math.sqrt(-2 * Math.log(u));
      spare = r * Math.sin(2 * Math.PI * v);
      return r * Math.cos(2 * Math.PI * v);
    },
  };
}

/** Agents in pipeline order. `stage` groups them for the UI. */
export const AGENTS = [
  { id: 'monitor', name: 'Wallet Monitor', stage: 'Signal', icon: '👁' },
  { id: 'macro', name: 'Macro Scout', stage: 'Scan', icon: '🌐' },
  { id: 'liq', name: 'Liq Mapper', stage: 'Scan', icon: '🧲' },
  { id: 'funding', name: 'Funding Watch', stage: 'Scan', icon: '⏱' },
  { id: 'squeeze', name: 'Squeeze Gate', stage: 'Risk gate', icon: '🚧' },
  { id: 'news', name: 'News Filter', stage: 'Risk gate', icon: '📰' },
  { id: 'sizer', name: 'Sizer', stage: 'Size & execute', icon: '⚖' },
  { id: 'exec', name: 'Executor', stage: 'Size & execute', icon: '⚡' },
  { id: 'tp', name: 'TP Manager', stage: 'Exit', icon: '🎯' },
  { id: 'stopguard', name: 'Stop Guard', stage: 'Exit', icon: '🛡' },
  { id: 'scribe', name: 'Scribe', stage: 'Log', icon: '📜' },
];

function hex(rng, n) {
  let s = '';
  for (let i = 0; i < n; i++) s += '0123456789abcdef'[rng.int(16)];
  return s;
}

export class Desk {
  /**
   * @param {Partial<typeof DEFAULTS>} [cfg]
   * @param {number} [seed]
   * @param {{ squeezeGate?: boolean, newsFilter?: boolean }} [toggles]
   */
  constructor(cfg = {}, seed = 1, toggles = {}) {
    this.cfg = { ...DEFAULTS, ...cfg };
    this.seed = seed;
    this.rng = createRng(seed);
    this.toggles = { squeezeGate: true, newsFilter: true, ...toggles };
    this.equity = this.cfg.startEquity;
    this.equityHistory = [this.equity];
    this.signals = 0;
    this.trades = [];
    this.blocked = { squeeze: 0, news: 0 };
    this.liquidations = 0;
    this.feesPaid = 0;
    this.fundingNet = 0;
    this.feed = [];
    this.fills = [];
    this.chart = null;
    this.position = null;
    this.state = { kind: 'idle', wait: 2 };
    this.busted = false;
    this.nextTradeId = 1;
  }

  get done() {
    return this.busted || (this.signals >= this.cfg.signalsPerSession && this.state.kind === 'idle');
  }

  /** Advances one tick. Returns events for the UI: { type, agent?, text, tone? }. */
  step() {
    if (this.done) return [];
    const ev = [];
    const s = this.state;
    if (s.kind === 'idle') {
      if (this.chart) this.addBar(0, null);
      if (--s.wait > 0) return ev;
      if (this.signals >= this.cfg.signalsPerSession) return ev;
      const sig = this.newSignal();
      this.signals++;
      this.state = { kind: 'pipeline', stage: 0, sig };
      this.feed.unshift(sig);
      if (this.feed.length > 30) this.feed.pop();
      ev.push({ type: 'agent', agent: 'monitor', text: `${sig.entity} ${sig.wallet} sent ${sig.amount} of ${sig.asset.sym} → ${sig.dest}` });
      return ev;
    }
    if (s.kind === 'pipeline') return this.pipelineStep(s, ev);
    if (s.kind === 'open') return this.positionStep(ev);
    return ev;
  }

  newSignal() {
    const r = this.rng;
    const asset = r.pick(ASSETS);
    const crowded = r.next() < this.cfg.crowdedRate;
    const newsRisk = r.next() < this.cfg.newsRiskRate;
    const funding = crowded ? -Math.abs(r.normal() * this.cfg.fundingSd) - this.cfg.fundingSd : r.normal() * this.cfg.fundingSd + this.cfg.fundingSd * 0.3;
    const usd = Math.round(r.range(0.4, 25) * 10) / 10;
    // fresh chart for this asset: history the agents can see, ending at a realistic price
    const startPrice = asset.price * Math.exp(r.normal() * 0.03);
    this.chart = { asset, bars: [], lines: {}, marks: [] };
    let p = startPrice;
    for (let i = 0; i < this.cfg.historyBars; i++) {
      this.addBar(0, null, true);
      p = this.chart.bars[this.chart.bars.length - 1].c;
    }
    return {
      id: this.signals + 1,
      asset,
      entity: r.pick(ENTITIES),
      wallet: `0x${hex(r, 4)}…${hex(r, 2)}`,
      dest: r.pick(EXCHANGES),
      amount: `$${usd}M`,
      crowded,
      newsRisk,
      funding,
      macro: r.next() < 0.5 ? 'risk-off' : 'risk-on',
      vix: (13 + r.next() * 14).toFixed(1),
      longsAt: p * (1 - r.range(0.012, 0.03)),
      blockedBy: null,
    };
  }

  /** Appends one OHLC bar. side 'short' applies the assumed edge and squeeze risk. */
  addBar(drift, sig, quiet = false) {
    const r = this.rng;
    const c0 = this.cfg;
    const bars = this.chart.bars;
    const prev = bars.length ? bars[bars.length - 1].c : this.chart.asset.price;
    let o = prev;
    if (r.next() < c0.gapChance) o *= 1 + (r.next() < 0.5 ? 1 : -1) * r.range(c0.gapMin, c0.gapMax);
    if (sig) {
      if (sig.crowded && r.next() < c0.squeezeChance) o *= 1 + r.range(c0.gapMin, c0.gapMax);
      if (sig.newsRisk && r.next() < c0.newsGapChance) o *= 1 + r.range(c0.gapMin, c0.gapMax);
    }
    const v = c0.barVol;
    const c = o * Math.exp(drift + v * r.normal() - (v * v) / 2);
    const h = Math.max(o, c) * Math.exp(Math.abs(r.normal()) * v * 0.6);
    const l = Math.min(o, c) * Math.exp(-Math.abs(r.normal()) * v * 0.6);
    const vol = Math.round(r.range(20, 100) * (1 + Math.abs(c - o) / o / v));
    bars.push({ o, h, l, c, vol });
    if (!quiet && bars.length > c0.historyBars + c0.maxBars) bars.shift();
    return bars[bars.length - 1];
  }

  pipelineStep(s, ev) {
    const sig = s.sig;
    const c = this.cfg;
    const fmtPct = (x) => `${(x * 100).toFixed(4)}%`;
    s.stage++;
    const agent = AGENTS[s.stage];
    if (!agent) return ev;
    switch (agent.id) {
      case 'macro':
        ev.push({ type: 'agent', agent: 'macro', text: `${sig.macro} · VIX ${sig.vix}` });
        break;
      case 'liq':
        ev.push({ type: 'agent', agent: 'liq', text: `longs stacked near ${sig.longsAt.toFixed(sig.asset.dec)}` });
        break;
      case 'funding':
        ev.push({ type: 'agent', agent: 'funding', text: `funding ${fmtPct(sig.funding)}/bar · ${sig.crowded ? 'shorts crowded' : 'not crowded'}`, tone: sig.crowded ? 'warn' : null });
        break;
      case 'squeeze':
        if (sig.crowded && this.toggles.squeezeGate) return this.block(sig, 'squeeze', 'blocked: crowded shorts', ev);
        ev.push({ type: 'agent', agent: 'squeeze', text: sig.crowded ? 'gate OFF: crowded short let through' : 'pass', tone: sig.crowded ? 'warn' : 'ok' });
        break;
      case 'news':
        if (sig.newsRisk && this.toggles.newsFilter) return this.block(sig, 'news', 'blocked: headline risk', ev);
        ev.push({ type: 'agent', agent: 'news', text: sig.newsRisk ? 'filter OFF: headline risk ignored' : 'no headlines · pass', tone: sig.newsRisk ? 'warn' : 'ok' });
        break;
      case 'sizer': {
        const margin = this.equity * c.marginPct;
        if (margin < 1) {
          this.busted = true;
          ev.push({ type: 'agent', agent: 'sizer', text: 'equity too low to trade', tone: 'bad' });
          this.state = { kind: 'idle', wait: 1 };
          return ev;
        }
        sig.margin = margin;
        ev.push({ type: 'agent', agent: 'sizer', text: `margin $${margin.toFixed(2)} × ${c.leverage}x = $${(margin * c.leverage).toFixed(0)}` });
        break;
      }
      case 'exec':
        this.open(sig, ev);
        break;
      default:
        break;
    }
    return ev;
  }

  block(sig, gate, text, ev) {
    sig.blockedBy = gate;
    this.blocked[gate]++;
    ev.push({ type: 'agent', agent: gate, text, tone: 'block' });
    ev.push({ type: 'blocked', gate, text: `${sig.asset.sym} short ${text}` });
    this.state = { kind: 'idle', wait: this.idleWait() };
    return ev;
  }

  idleWait() {
    return this.cfg.idleMin + this.rng.int(this.cfg.idleMax - this.cfg.idleMin + 1);
  }

  open(sig, ev) {
    const c = this.cfg;
    const entry = this.chart.bars[this.chart.bars.length - 1].c;
    const notional = sig.margin * c.leverage;
    const qty = notional / entry;
    const liq = entry * (1 + 1 / c.leverage - c.maintenance);
    const fee = notional * c.makerFee;
    this.position = {
      id: this.nextTradeId++,
      sig,
      entry,
      qty,
      qtyOpen: qty,
      margin: sig.margin,
      notional,
      lev: c.leverage,
      stop: Math.min(entry * (1 + c.stop), liq * 0.999),
      liq,
      tp1: entry * (1 - c.tp1),
      tp2: entry * (1 - c.tp2),
      tp1Done: false,
      bars: 0,
      realized: -fee,
      fees: fee,
      funding: 0,
      exits: [],
      openIndex: this.chart.bars.length - 1,
    };
    this.chart.marks = [{ i: this.chart.bars.length - 1, price: entry, kind: 'entry' }];
    this.syncLines();
    this.state = { kind: 'open' };
    this.addFill('SELL', sig.asset, entry, notional, 'open short · post-only');
    ev.push({ type: 'agent', agent: 'exec', text: `short ${sig.asset.sym} @ ${entry.toFixed(sig.asset.dec)} · ${c.leverage}x`, tone: 'ok' });
    ev.push({ type: 'open', text: `Opened ${sig.asset.sym} short` });
  }

  syncLines() {
    const p = this.position;
    this.chart.lines = p
      ? { entry: p.entry, stop: p.stop, liq: p.liq, tp1: p.tp1Done ? null : p.tp1, tp2: p.tp2 }
      : {};
  }

  addFill(side, asset, price, notional, note) {
    this.fills.unshift({ side, sym: asset.sym, price, dec: asset.dec, notional, note, n: this.fills.length + 1 });
    if (this.fills.length > 30) this.fills.pop();
  }

  closePart(fraction, price, kind, ev, fee) {
    const p = this.position;
    const qty = p.qty * fraction;
    if (qty > p.qtyOpen + 1e-12) return;
    let pnl;
    if (kind === 'liq') {
      pnl = -p.margin * (qty / p.qty); // isolated margin on this part is gone
    } else {
      pnl = qty * (p.entry - price);
    }
    const f = qty * price * fee;
    p.qtyOpen -= qty;
    p.realized += pnl - f;
    p.fees += f;
    p.exits.push({ kind, price, qty });
    this.chart.marks.push({ i: this.chart.bars.length - 1, price, kind });
    const sym = p.sig.asset;
    this.addFill('BUY', sym, price, qty * price, kind === 'tp1' ? 'TP 1 · half' : kind === 'tp2' ? 'TP 2 · rest' : kind);
    const agent = kind.startsWith('tp') ? 'tp' : 'stopguard';
    ev.push({ type: 'agent', agent, text: `${kind === 'liq' ? 'LIQUIDATED' : kind.toUpperCase()} @ ${price.toFixed(sym.dec)}`, tone: pnl >= 0 ? 'ok' : 'bad' });
  }

  positionStep(ev) {
    const p = this.position;
    const c = this.cfg;
    const bar = this.addBar(-c.edgePerBar, p.sig);
    p.bars++;
    // funding on what is still open: shorts receive positive funding, pay negative
    const fund = p.sig.funding * p.qtyOpen * bar.o;
    p.realized += fund;
    p.funding += fund;
    // adverse side first (conservative): gap at the open, then the high
    if (bar.o >= p.liq || bar.h >= p.liq && p.stop >= p.liq) {
      this.liquidations++;
      this.closePart(p.qtyOpen / p.qty, p.liq, 'liq', ev, c.takerFee);
      return this.finish(ev, 'liquidated');
    }
    if (bar.o >= p.stop) {
      this.closePart(p.qtyOpen / p.qty, bar.o, p.tp1Done ? 'trail' : 'stop', ev, c.takerFee);
      return this.finish(ev, p.tp1Done ? 'trailing stop' : 'stop (gapped)');
    }
    if (bar.h >= p.stop) {
      this.closePart(p.qtyOpen / p.qty, p.stop, p.tp1Done ? 'trail' : 'stop', ev, c.takerFee);
      return this.finish(ev, p.tp1Done ? 'trailing stop' : 'stop');
    }
    if (!p.tp1Done && bar.l <= p.tp1) {
      this.closePart(0.5, p.tp1, 'tp1', ev, c.makerFee);
      p.tp1Done = true;
      p.stop = Math.min(p.stop, p.entry); // breakeven
      ev.push({ type: 'agent', agent: 'stopguard', text: 'stop moved to breakeven', tone: 'ok' });
    }
    if (p.tp1Done && bar.l <= p.tp2) {
      this.closePart(p.qtyOpen / p.qty, p.tp2, 'tp2', ev, c.makerFee);
      return this.finish(ev, 'take-profit 2');
    }
    if (p.tp1Done) p.stop = Math.min(p.stop, bar.l * (1 + c.trail));
    if (p.bars >= c.maxBars) {
      this.closePart(p.qtyOpen / p.qty, bar.c, 'time', ev, c.takerFee);
      return this.finish(ev, 'time exit');
    }
    this.syncLines();
    return ev;
  }

  finish(ev, reason) {
    const p = this.position;
    const pnl = Math.max(p.realized, -this.equity);
    this.equity = Math.max(0, this.equity + pnl);
    this.equityHistory.push(this.equity);
    this.feesPaid += p.fees;
    this.fundingNet += p.funding;
    const exitValue = p.exits.reduce((s, x) => s + x.price * x.qty, 0);
    const trade = {
      id: p.id,
      sym: p.sig.asset.sym,
      dec: p.sig.asset.dec,
      entity: p.sig.entity,
      entry: p.entry,
      exitAvg: exitValue / p.qty,
      reason,
      pnl,
      roe: pnl / p.margin,
      fees: p.fees,
      funding: p.funding,
      bars: p.bars,
      lev: p.lev,
      crowded: p.sig.crowded,
      newsRisk: p.sig.newsRisk,
    };
    this.trades.unshift(trade);
    this.position = null;
    this.syncLines();
    this.state = { kind: 'idle', wait: this.idleWait() };
    if (this.equity < 1) this.busted = true;
    ev.push({ type: 'agent', agent: 'scribe', text: `#${trade.id} ${trade.sym} ${reason} ${pnl >= 0 ? '+' : '−'}$${Math.abs(pnl).toFixed(2)}`, tone: pnl >= 0 ? 'ok' : 'bad' });
    ev.push({ type: 'closed', trade });
    return ev;
  }

  runToEnd(maxSteps = 100000) {
    for (let i = 0; i < maxSteps && !this.done; i++) this.step();
    return this;
  }
}

/** Runs many sessions with the same settings. Returns summary numbers for the reality check. */
/**
 * @param {Partial<typeof DEFAULTS>} cfg
 * @param {{ squeezeGate?: boolean, newsFilter?: boolean }} toggles
 */
export function realityCheck(cfg, toggles, runs = 1000, seed0 = 1) {
  const finals = [];
  let trades = 0, wins = 0, liqs = 0, blocked = 0, busts = 0;
  for (let i = 0; i < runs; i++) {
    const d = new Desk(cfg, seed0 + i, toggles).runToEnd();
    finals.push(d.equity);
    trades += d.trades.length;
    wins += d.trades.filter((t) => t.pnl > 0).length;
    liqs += d.liquidations;
    blocked += d.blocked.squeeze + d.blocked.news;
    if (d.busted) busts++;
  }
  const start = { ...DEFAULTS, ...cfg }.startEquity;
  const sorted = [...finals].sort((a, b) => a - b);
  return {
    runs,
    start,
    finals,
    avg: finals.reduce((a, b) => a + b, 0) / runs,
    median: sorted[Math.floor(runs / 2)],
    p10: sorted[Math.floor(runs * 0.1)],
    p90: sorted[Math.floor(runs * 0.9)],
    belowStart: finals.filter((f) => f < start).length / runs,
    winRate: trades ? wins / trades : 0,
    tradesPerRun: trades / runs,
    liqsPerRun: liqs / runs,
    blockedPerRun: blocked / runs,
    busts: busts / runs,
  };
}
