/**
 * Paper trading desk engine. Eleven bots pass each signal down a pipeline and
 * manage leveraged shorts on simulated perpetual futures. Prices are a random
 * walk; nothing here reads a real market or places a real order.
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
  /** Sizer: share of equity put up as margin per trade (isolated margin). */
  marginPct: 0.1,
  /** Post-only entries and take-profits pay maker; stops, time exits and liquidations pay taker. */
  makerFee: 0.00015,
  takerFee: 0.00045,
  barVol: 0.003,
  /**
   * Assumed edge of the wallet-monitor signal: per-bar downward drift while a short is open.
   * 0 = the signal predicts nothing. An assumption to explore, never a measured fact.
   */
  edgePerBar: 0,
  gapChance: 0.012,
  gapMin: 0.006,
  gapMax: 0.05,
  /** ASSUMPTION: crowded shorts get squeezed (upward gaps) more often. */
  squeezeChance: 0.03,
  newsRiskRate: 0.12,
  /** ASSUMPTION: a pending headline causes more gaps. */
  newsGapChance: 0.03,
  /** ASSUMPTION: risk-on markets drift up this much per bar, risk-off down. */
  regimeDrift: 0.00008,
  /** Wallet Monitor: ignore transfers smaller than this, in $M. */
  minAlertUsdM: 2,
  /** Macro Scout: skip shorts when risk-on and the VIX is below this. */
  macroVixMin: 15,
  /** Funding Watch: crowded when funding per bar is at or below this and open interest grew at least crowdOi. */
  crowdFunding: -0.00002,
  crowdOi: 0.05,
  /** Liq Mapper: use the long-liquidation cluster as TP2 when it is within this distance. */
  liqTargetMax: 0.04,
  /** Executor: chance per bar that a post-only order fills, and bars to wait before giving up. */
  postOnlyFill: 0.6,
  postOnlyWaitBars: 3,
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

/** On/off switches for the bots that have one. */
export const DEFAULT_TOGGLES = {
  monitorFilter: true,
  macroGate: true,
  liqTarget: true,
  squeezeGate: true,
  newsFilter: true,
  sizerCut: true,
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

/**
 * The bots, in pipeline order. `job` is what the bot is for; `rule` is exactly
 * what it does in this simulator. `toggle` names its on/off switch, `gate` marks
 * bots that can block a signal.
 */
export const AGENTS = [
  { id: 'monitor', name: 'Wallet Monitor', stage: 'Signal', icon: '👁', gate: true, toggle: 'monitorFilter',
    job: 'Watches fund, VC and team wallets. A big transfer to an exchange is the signal to short.',
    rule: 'Turns every transfer into a signal, but ignores ones smaller than the minimum size.' },
  { id: 'macro', name: 'Macro Scout', stage: 'Scan', icon: '🌐', gate: true, toggle: 'macroGate',
    job: 'Reads the Nasdaq and the VIX.',
    rule: 'Skips shorts when the market is risk-on and the VIX is below the threshold. In this simulator risk-on markets drift up slightly, which hurts shorts.' },
  { id: 'liq', name: 'Liq Mapper', stage: 'Scan', icon: '🧲', toggle: 'liqTarget',
    job: 'Finds where leveraged longs are stacked.',
    rule: 'Moves take-profit 2 to the long-liquidation cluster when it sits between 1.5% and 4% below entry.' },
  { id: 'funding', name: 'Funding Watch', stage: 'Scan', icon: '⏱',
    job: 'Tracks funding and open interest.',
    rule: 'Flags the short as crowded when funding is negative enough and open interest jumped 5% or more. Squeeze Gate acts on the flag.' },
  { id: 'squeeze', name: 'Squeeze Gate', stage: 'Risk gate', icon: '🚧', gate: true, toggle: 'squeezeGate',
    job: 'Blocks crowded shorts.',
    rule: 'Blocks any signal Funding Watch flags as crowded. In this simulator crowded shorts get squeezed (sudden jumps up) more often.' },
  { id: 'news', name: 'News Filter', stage: 'Risk gate', icon: '📰', gate: true, toggle: 'newsFilter',
    job: 'Checks headlines before entry.',
    rule: 'Blocks entries while a headline is pending. In this simulator those trades see more sudden jumps.' },
  { id: 'sizer', name: 'Sizer', stage: 'Size & execute', icon: '⚖', toggle: 'sizerCut',
    job: 'Sets margin and leverage.',
    rule: 'Puts a share of equity up as margin at your leverage. Halves it when a warning got past a gate that was switched off.' },
  { id: 'exec', name: 'Executor', stage: 'Size & execute', icon: '⚡',
    job: 'Opens the short with a post-only order (paper only, no exchange).',
    rule: 'A post-only order fills on a bar 60% of the time. After 3 bars without a fill the trade is missed. Pays the maker fee.' },
  { id: 'tp', name: 'TP Manager', stage: 'Exit', icon: '🎯',
    job: 'Takes profit in two steps.',
    rule: 'Closes half at take-profit 1 and the rest at take-profit 2. Both are limit orders that pay the maker fee.' },
  { id: 'stopguard', name: 'Stop Guard', stage: 'Exit', icon: '🛡',
    job: 'Trails every stop.',
    rule: 'Starts with a stop above entry, moves it to breakeven after take-profit 1, then trails it above the lowest price. Stops fill at the bar’s open if price jumps past them.' },
  { id: 'scribe', name: 'Scribe', stage: 'Log', icon: '📜',
    job: 'Logs every fill.',
    rule: 'Records each trade with its fees, funding and result, and keeps every bot’s scoreboard.' },
];

function hex(rng, n) {
  let s = '';
  for (let i = 0; i < n; i++) s += '0123456789abcdef'[rng.int(16)];
  return s;
}

/** One OHLC bar. Pure: depends only on its inputs and the rng. */
export function makeBar(prev, drift, sig, rng, c) {
  let o = prev;
  if (rng.next() < c.gapChance) o *= 1 + (rng.next() < 0.5 ? 1 : -1) * rng.range(c.gapMin, c.gapMax);
  if (sig) {
    if (sig.crowded && rng.next() < c.squeezeChance) o *= 1 + rng.range(c.gapMin, c.gapMax);
    if (sig.newsRisk && rng.next() < c.newsGapChance) o *= 1 + rng.range(c.gapMin, c.gapMax);
  }
  const v = c.barVol;
  const cl = o * Math.exp(drift + v * rng.normal() - (v * v) / 2);
  const h = Math.max(o, cl) * Math.exp(Math.abs(rng.normal()) * v * 0.6);
  const l = Math.min(o, cl) * Math.exp(-Math.abs(rng.normal()) * v * 0.6);
  const vol = Math.round(rng.range(20, 100) * (1 + Math.abs(cl - o) / o / v));
  return { o, h, l, c: cl, vol };
}

/** Per-bar drift while short: the assumed edge plus the market regime. */
export function shortDrift(sig, c) {
  return -c.edgePerBar + (sig.regime === 'risk-on' ? c.regimeDrift : -c.regimeDrift);
}

export function newPosition(sig, entry, margin, c) {
  const notional = margin * c.leverage;
  const liq = entry * (1 + 1 / c.leverage - c.maintenance);
  const fee = notional * c.makerFee;
  return {
    sig, entry, margin, notional, lev: c.leverage,
    qty: notional / entry, qtyOpen: notional / entry,
    stop: Math.min(entry * (1 + c.stop), liq * 0.999),
    liq,
    tp1: entry * (1 - c.tp1),
    tp2: entry * (1 - (sig.tp2Pct ?? c.tp2)),
    tp1Done: false, bars: 0,
    realized: -fee, fees: fee, funding: 0, exits: [],
    id: 0, openIndex: 0,
  };
}

/**
 * Runs Stop Guard and TP Manager on one bar. Mutates the position and returns
 * what happened: { exits: [{ kind, price, qty, pnl }], closed: reason | null, moved: string | null }.
 * Adverse moves are checked first (conservative): a gap at the open, then the high.
 */
export function manageBar(p, bar, c) {
  /** @type {{ exits: { kind: string, price: number, qty: number, pnl: number }[], closed: string | null, moved: string | null }} */
  const out = { exits: [], closed: null, moved: null };
  p.bars++;
  const fund = p.sig.funding * p.qtyOpen * bar.o; // shorts receive positive funding, pay negative
  p.realized += fund;
  p.funding += fund;
  const close = (frac, price, kind, feeRate) => {
    const qty = p.qty * frac;
    const pnl = kind === 'liq' ? -p.margin * frac : qty * (p.entry - price);
    const f = qty * price * feeRate;
    p.qtyOpen -= qty;
    p.realized += pnl - f;
    p.fees += f;
    p.exits.push({ kind, price, qty });
    out.exits.push({ kind, price, qty, pnl: pnl - f });
  };
  const rest = () => p.qtyOpen / p.qty;
  if (bar.o >= p.liq || (bar.h >= p.liq && p.stop >= p.liq)) {
    close(rest(), p.liq, 'liq', c.takerFee);
    out.closed = 'liquidated';
    return out;
  }
  if (bar.o >= p.stop) {
    close(rest(), bar.o, p.tp1Done ? 'trail' : 'stop', c.takerFee);
    out.closed = p.tp1Done ? 'trailing stop' : 'stop (gapped)';
    return out;
  }
  if (bar.h >= p.stop) {
    close(rest(), p.stop, p.tp1Done ? 'trail' : 'stop', c.takerFee);
    out.closed = p.tp1Done ? 'trailing stop' : 'stop';
    return out;
  }
  if (!p.tp1Done && bar.l <= p.tp1) {
    close(0.5, p.tp1, 'tp1', c.makerFee);
    p.tp1Done = true;
    p.stop = Math.min(p.stop, p.entry);
    out.moved = 'stop moved to breakeven';
  }
  if (p.tp1Done && bar.l <= p.tp2) {
    close(rest(), p.tp2, 'tp2', c.makerFee);
    out.closed = 'take-profit 2';
    return out;
  }
  if (p.tp1Done) {
    const trailed = Math.min(p.stop, bar.l * (1 + c.trail));
    if (trailed < p.stop) {
      p.stop = trailed;
      out.moved = out.moved ?? `trailing stop @ ${trailed.toPrecision(5)}`;
    }
  }
  if (p.bars >= c.maxBars) {
    close(rest(), bar.c, 'time', c.takerFee);
    out.closed = 'time exit';
  }
  return out;
}

function emptyStats() {
  /** @type {Record<string, { runs: number, acted: number, blocked: number, shadowPnl: number, shadowN: number, log: { text: string, tone: string | null }[] }>} */
  const s = {};
  for (const a of AGENTS) s[a.id] = { runs: 0, acted: 0, blocked: 0, shadowPnl: 0, shadowN: 0, log: [] };
  return s;
}

export class Desk {
  /**
   * @param {Partial<typeof DEFAULTS>} [cfg]
   * @param {number} [seed]
   * @param {Partial<typeof DEFAULT_TOGGLES>} [toggles]
   */
  constructor(cfg = {}, seed = 1, toggles = {}) {
    this.cfg = { ...DEFAULTS, ...cfg };
    this.seed = seed;
    this.rng = createRng(seed);
    this.toggles = { ...DEFAULT_TOGGLES, ...toggles };
    this.equity = this.cfg.startEquity;
    this.equityHistory = [this.equity];
    this.signals = 0;
    /** @type {any[]} */
    this.trades = [];
    /** @type {Record<string, number>} */
    this.blocked = { monitor: 0, macro: 0, squeeze: 0, news: 0 };
    this.missed = 0;
    this.liquidations = 0;
    this.feesPaid = 0;
    this.fundingNet = 0;
    /** @type {any[]} */
    this.feed = [];
    /** @type {any[]} */
    this.fills = [];
    /** @type {any} */
    this.chart = null;
    /** @type {any} */
    this.position = null;
    /** @type {any} */
    this.state = { kind: 'idle', wait: 2 };
    this.busted = false;
    this.nextTradeId = 1;
    this.bots = emptyStats();
  }

  get done() {
    return this.busted || (this.signals >= this.cfg.signalsPerSession && this.state.kind === 'idle');
  }

  get totalBlocked() {
    return this.blocked.monitor + this.blocked.macro + this.blocked.squeeze + this.blocked.news;
  }

  /** Records a bot decision for its scoreboard and returns the UI event. */
  say(id, text, tone = null, acted = false) {
    const b = this.bots[id];
    b.runs++;
    if (acted) b.acted++;
    b.log.unshift({ text, tone });
    if (b.log.length > 6) b.log.pop();
    return { type: 'agent', agent: id, text, tone };
  }

  /** Advances one tick. Returns events for the UI. */
  step() {
    if (this.done) return [];
    /** @type {any[]} */
    const ev = [];
    const s = this.state;
    if (s.kind === 'idle') {
      if (this.chart) this.pushBar(0, null);
      if (--s.wait > 0) return ev;
      if (this.signals >= this.cfg.signalsPerSession) return ev;
      const sig = this.newSignal();
      this.signals++;
      this.feed.unshift(sig);
      if (this.feed.length > 30) this.feed.pop();
      this.state = { kind: 'pipeline', stage: 0, sig, wait: 0 };
      if (this.toggles.monitorFilter && sig.usdM < this.cfg.minAlertUsdM) {
        return this.block(sig, 'monitor', `ignored: $${sig.usdM}M is under $${this.cfg.minAlertUsdM}M`, ev);
      }
      ev.push(this.say('monitor', `${sig.entity} ${sig.wallet} sent $${sig.usdM}M of ${sig.asset.sym} → ${sig.dest}`, 'ok', true));
      return ev;
    }
    if (s.kind === 'pipeline') return this.pipelineStep(s, ev);
    if (s.kind === 'open') return this.positionStep(ev);
    return ev;
  }

  newSignal() {
    const r = this.rng;
    const c = this.cfg;
    const asset = r.pick(ASSETS);
    const crowding = r.next() < 0.3;
    const funding = crowding
      ? -(Math.abs(r.normal()) * c.fundingSd + c.fundingSd * 1.2)
      : r.normal() * c.fundingSd + c.fundingSd * 0.3;
    const oiChange = crowding ? r.range(0.05, 0.2) : r.range(-0.05, 0.08);
    const regime = r.next() < 0.5 ? 'risk-on' : 'risk-off';
    const vix = regime === 'risk-on' ? r.range(11, 19) : r.range(17, 32);
    const usdM = Math.round((Math.pow(r.next(), 1.6) * 24 + 0.3) * 10) / 10;
    // fresh chart for this asset: history the bots can see
    this.chart = { asset, bars: [], lines: {}, marks: [] };
    let prev = asset.price * Math.exp(r.normal() * 0.03);
    for (let i = 0; i < c.historyBars; i++) {
      const b = makeBar(prev, 0, null, r, c);
      this.chart.bars.push(b);
      prev = b.c;
    }
    return {
      id: this.signals + 1,
      asset,
      entity: r.pick(ENTITIES),
      wallet: `0x${hex(r, 4)}…${hex(r, 2)}`,
      dest: r.pick(EXCHANGES),
      usdM,
      funding,
      oiChange,
      crowded: funding <= c.crowdFunding && oiChange >= c.crowdOi,
      newsRisk: r.next() < c.newsRiskRate,
      regime,
      vix,
      longsAt: prev * (1 - r.range(0.012, 0.05)),
      price: prev,
      warnings: 0,
      /** @type {string | null} */
      blockedBy: null,
      /** @type {number | null} */
      tp2Pct: null,
      margin: 0,
    };
  }

  pushBar(drift, sig) {
    const bars = this.chart.bars;
    const b = makeBar(bars[bars.length - 1].c, drift, sig, this.rng, this.cfg);
    bars.push(b);
    if (bars.length > this.cfg.historyBars + this.cfg.maxBars) {
      bars.shift();
      this.chart.marks.forEach((m) => m.i--);
      if (this.position) this.position.openIndex--;
    }
    return b;
  }

  pipelineStep(s, ev) {
    const sig = s.sig;
    const c = this.cfg;
    const t = this.toggles;
    if (AGENTS[s.stage].id !== 'exec') s.stage++;
    const agent = AGENTS[s.stage];
    switch (agent.id) {
      case 'macro': {
        const headwind = sig.regime === 'risk-on' && sig.vix < c.macroVixMin;
        if (headwind && t.macroGate) return this.block(sig, 'macro', `blocked: risk-on, VIX ${sig.vix.toFixed(1)}`, ev);
        if (headwind) sig.warnings++;
        ev.push(this.say('macro', `${sig.regime} · VIX ${sig.vix.toFixed(1)}${headwind ? ' · headwind, gate off' : ''}`, headwind ? 'warn' : 'ok'));
        break;
      }
      case 'liq': {
        const d = 1 - sig.longsAt / sig.price;
        if (t.liqTarget && d >= c.tp1 * 1.5 && d <= c.liqTargetMax) {
          sig.tp2Pct = d;
          ev.push(this.say('liq', `longs stacked at ${sig.longsAt.toFixed(sig.asset.dec)} → TP2 −${(d * 100).toFixed(1)}%`, 'ok', true));
        } else {
          ev.push(this.say('liq', `longs at ${sig.longsAt.toFixed(sig.asset.dec)} · TP2 stays −${(c.tp2 * 100).toFixed(1)}%`));
        }
        break;
      }
      case 'funding':
        ev.push(this.say('funding', `funding ${(sig.funding * 100).toFixed(4)}% · OI ${sig.oiChange >= 0 ? '+' : ''}${(sig.oiChange * 100).toFixed(0)}% · ${sig.crowded ? 'CROWDED' : 'ok'}`, sig.crowded ? 'warn' : 'ok', sig.crowded));
        break;
      case 'squeeze':
        if (sig.crowded && t.squeezeGate) return this.block(sig, 'squeeze', 'blocked: crowded shorts', ev);
        if (sig.crowded) sig.warnings++;
        ev.push(this.say('squeeze', sig.crowded ? 'gate off: crowded short let through' : 'pass', sig.crowded ? 'warn' : 'ok'));
        break;
      case 'news':
        if (sig.newsRisk && t.newsFilter) return this.block(sig, 'news', 'blocked: headline pending', ev);
        if (sig.newsRisk) sig.warnings++;
        ev.push(this.say('news', sig.newsRisk ? 'filter off: headline ignored' : 'no headlines · pass', sig.newsRisk ? 'warn' : 'ok'));
        break;
      case 'sizer': {
        let margin = this.equity * c.marginPct;
        const cut = t.sizerCut && sig.warnings > 0;
        if (cut) margin /= 2;
        if (margin < 1) {
          this.busted = true;
          ev.push(this.say('sizer', 'equity too low to trade', 'bad'));
          this.state = { kind: 'idle', wait: 1 };
          return ev;
        }
        sig.margin = margin;
        ev.push(this.say('sizer', `margin $${margin.toFixed(2)} × ${c.leverage}x = $${(margin * c.leverage).toFixed(0)}${cut ? ' (halved)' : ''}`, cut ? 'warn' : null, cut));
        break;
      }
      case 'exec': {
        // post-only: the order rests until price trades into it
        if (s.wait > 0) this.pushBar(0, null);
        if (this.rng.next() < c.postOnlyFill) {
          this.open(sig, ev);
        } else if (++s.wait > c.postOnlyWaitBars) {
          this.missed++;
          ev.push(this.say('exec', `post-only not filled after ${c.postOnlyWaitBars} bars · cancelled`, 'warn'));
          ev.push({ type: 'missed', text: `${sig.asset.sym} short missed: post-only order never filled` });
          sig.blockedBy = 'missed';
          this.state = { kind: 'idle', wait: this.idleWait() };
        } else {
          ev.push(this.say('exec', `post-only resting · bar ${s.wait}/${c.postOnlyWaitBars}`));
        }
        break;
      }
      default:
        break;
    }
    return ev;
  }

  /** Blocks a signal, and plays out what the trade would have done on paper (separate rng). */
  block(sig, gate, text, ev) {
    sig.blockedBy = gate;
    this.blocked[gate]++;
    const shadow = this.shadowTrade(sig);
    const b = this.bots[gate];
    b.blocked++;
    b.shadowPnl += shadow;
    b.shadowN++;
    ev.push(this.say(gate, text, 'block', true));
    ev.push({ type: 'blocked', gate, text: `${sig.asset.sym} short ${text}` });
    this.state = { kind: 'idle', wait: this.idleWait() };
    return ev;
  }

  /** What a blocked trade would have made, simulated on its own random path. Does not touch equity. */
  shadowTrade(sig) {
    const c = this.cfg;
    const rng = createRng((this.seed * 2654435761 + sig.id * 40503) >>> 0);
    const margin = this.equity * c.marginPct;
    if (margin < 1) return 0;
    const p = newPosition(sig, sig.price, margin, c);
    let prev = sig.price;
    for (let i = 0; i < c.maxBars + 1; i++) {
      const bar = makeBar(prev, shortDrift(sig, c), sig, rng, c);
      prev = bar.c;
      if (manageBar(p, bar, c).closed) break;
    }
    return p.realized;
  }

  idleWait() {
    return this.cfg.idleMin + this.rng.int(this.cfg.idleMax - this.cfg.idleMin + 1);
  }

  open(sig, ev) {
    const c = this.cfg;
    const entry = this.chart.bars[this.chart.bars.length - 1].c;
    const p = newPosition(sig, entry, sig.margin, c);
    p.id = this.nextTradeId++;
    p.openIndex = this.chart.bars.length - 1;
    this.position = p;
    this.chart.marks = [{ i: p.openIndex, price: entry, kind: 'entry' }];
    this.syncLines();
    this.state = { kind: 'open' };
    this.addFill('SELL', sig.asset, entry, p.notional, 'open short · post-only');
    ev.push(this.say('exec', `short ${sig.asset.sym} @ ${entry.toFixed(sig.asset.dec)} · ${c.leverage}x`, 'ok', true));
    ev.push(this.say('tp', `TP1 ${p.tp1.toFixed(sig.asset.dec)} · TP2 ${p.tp2.toFixed(sig.asset.dec)}`));
    ev.push(this.say('stopguard', `stop ${p.stop.toFixed(sig.asset.dec)} · liq ${p.liq.toFixed(sig.asset.dec)}`));
    ev.push({ type: 'open', text: `Opened ${sig.asset.sym} short` });
  }

  syncLines() {
    const p = this.position;
    if (!this.chart) return;
    this.chart.lines = p ? { entry: p.entry, stop: p.stop, liq: p.liq, tp1: p.tp1Done ? null : p.tp1, tp2: p.tp2 } : {};
  }

  addFill(side, asset, price, notional, note) {
    this.fills.unshift({ side, sym: asset.sym, price, dec: asset.dec, notional, note });
    if (this.fills.length > 30) this.fills.pop();
  }

  positionStep(ev) {
    const p = this.position;
    const c = this.cfg;
    const bar = this.pushBar(shortDrift(p.sig, c), p.sig);
    const res = manageBar(p, bar, c);
    const dec = p.sig.asset.dec;
    /** @type {Record<string, string>} */
    const labels = { tp1: 'TP 1 · half', tp2: 'TP 2 · rest', stop: 'stop', trail: 'trailing stop', liq: 'LIQUIDATED', time: 'time exit' };
    for (const x of res.exits) {
      this.chart.marks.push({ i: this.chart.bars.length - 1, price: x.price, kind: x.kind });
      const label = labels[x.kind];
      this.addFill('BUY', p.sig.asset, x.price, x.qty * x.price, label);
      const bot = x.kind.startsWith('tp') ? 'tp' : 'stopguard';
      if (x.kind === 'liq') this.liquidations++;
      ev.push(this.say(bot, `${label} @ ${x.price.toFixed(dec)}`, x.pnl >= 0 ? 'ok' : 'bad', true));
    }
    if (res.moved && !res.closed) ev.push(this.say('stopguard', res.moved, 'ok', true));
    if (res.closed) return this.finish(ev, res.closed);
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
      id: p.id, sym: p.sig.asset.sym, dec: p.sig.asset.dec, entity: p.sig.entity,
      entry: p.entry, exitAvg: exitValue / p.qty, reason, pnl, roe: pnl / p.margin,
      margin: p.margin, fees: p.fees, funding: p.funding, bars: p.bars, lev: p.lev,
      crowded: p.sig.crowded, newsRisk: p.sig.newsRisk, regime: p.sig.regime,
    };
    this.trades.unshift(trade);
    this.position = null;
    this.syncLines();
    this.state = { kind: 'idle', wait: this.idleWait() };
    if (this.equity < 1) this.busted = true;
    ev.push(this.say('scribe', `#${trade.id} ${trade.sym} ${reason} ${pnl >= 0 ? '+' : '−'}$${Math.abs(pnl).toFixed(2)}`, pnl >= 0 ? 'ok' : 'bad', true));
    ev.push({ type: 'closed', trade });
    return ev;
  }

  runToEnd(maxSteps = 100000) {
    for (let i = 0; i < maxSteps && !this.done; i++) this.step();
    return this;
  }
}

/**
 * Runs many sessions with the same settings and returns summary numbers.
 * @param {Partial<typeof DEFAULTS>} cfg
 * @param {Partial<typeof DEFAULT_TOGGLES>} toggles
 */
export function realityCheck(cfg, toggles, runs = 1000, seed0 = 1) {
  const finals = [];
  let trades = 0, wins = 0, liqs = 0, blocked = 0, busts = 0;
  /** @type {Record<string, number>} */
  const gateSaved = { monitor: 0, macro: 0, squeeze: 0, news: 0 };
  for (let i = 0; i < runs; i++) {
    const d = new Desk(cfg, seed0 + i, toggles).runToEnd();
    finals.push(d.equity);
    trades += d.trades.length;
    wins += d.trades.filter((t) => t.pnl > 0).length;
    liqs += d.liquidations;
    blocked += d.totalBlocked;
    if (d.busted) busts++;
    for (const g of Object.keys(gateSaved)) gateSaved[g] -= d.bots[g].shadowPnl;
  }
  const start = { ...DEFAULTS, ...cfg }.startEquity;
  const sorted = [...finals].sort((a, b) => a - b);
  for (const g of Object.keys(gateSaved)) gateSaved[g] /= runs;
  return {
    runs, start, finals,
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
    /** Average per session of what each gate's blocked trades would have lost (positive = the gate saved money). */
    gateSaved,
  };
}
