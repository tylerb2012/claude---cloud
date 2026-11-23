/**
 * Paper trader for Polymarket's "Bitcoin Up or Down" 5-minute markets.
 *
 * Strategy (copied from the bot in the screenshot): each 5-minute window, buy the side the
 * market thinks is LESS likely when its ask is between minPrice and maxPrice, then hold to
 * settlement (each share pays $1 if it wins, $0 if it loses). One entry per market.
 *
 * Pure logic only: no fetch, no DOM. The live runner, the backtest and the page all use it.
 * Nothing here places a real order.
 */

export const WINDOW_SEC = 300;

export const DEFAULTS = {
  startBalance: 10000,
  /** Only buy the underdog when its price is in this band. */
  minPrice: 0.2,
  maxPrice: 0.35,
  /** Dollars per trade. The bot in the screenshot used about $300-$900. */
  stake: 500,
  /** Entry window: no entries in the first `enterAfterSec` or the last `enterBeforeSec` of the 5 minutes. */
  enterAfterSec: 30,
  enterBeforeSec: 20,
  /** Don't buy more than this far above the best ask when walking the order book. */
  maxSlippage: 0.02,
  /**
   * Taker fee per fill, in dollars: shares x price x feeRate x (price x (1 - price)) ^ feeExponent.
   * ASSUMPTION: Polymarket's published crypto-market formula as of early 2026 (rate 0.25,
   * exponent 2, at most about 1.6% of the stake at 50c). Check docs.polymarket.com and change
   * these if it has moved. Set feeRate to 0 to ignore fees.
   */
  feeRate: 0.25,
  feeExponent: 2,
};

/** Unix seconds of the start of the 5-minute window that contains `nowSec`. */
export function slotStart(nowSec) {
  return Math.floor(nowSec / WINDOW_SEC) * WINDOW_SEC;
}

export function slugFor(start) {
  return `btc-updown-5m-${start}`;
}

export function takerFee(shares, price, cfg = DEFAULTS) {
  if (!cfg.feeRate) return 0;
  return shares * price * cfg.feeRate * Math.pow(price * (1 - price), cfg.feeExponent);
}

/**
 * Walks ascending asks [{p, s}] to spend up to `usd` (fee included) without paying more than
 * `limit` per share. Returns the fill, or null if nothing fills.
 */
export function fillFromAsks(asks, usd, limit, cfg = DEFAULTS) {
  let shares = 0;
  let cost = 0;
  let fee = 0;
  for (const { p, s } of asks) {
    if (p > limit + 1e-9) break;
    const perShare = p + takerFee(1, p, cfg);
    const left = usd - cost - fee;
    if (left <= 1e-9) break;
    const take = Math.min(s, left / perShare);
    if (take <= 0) break;
    shares += take;
    cost += take * p;
    fee += takerFee(take, p, cfg);
  }
  if (shares <= 1e-9) return null;
  return { shares, cost, fee, avg: cost / shares };
}

const bestAsk = (book) => (book && book.asks.length ? book.asks[0].p : null);

/**
 * Decides what to do with one market right now.
 * snap = { start, now, books: { Up: {asks, bids}, Down: {asks, bids} } }, asks ascending.
 * Returns { action: 'buy', side, fill, price } or { action: 'skip', reason }.
 */
export function decide(snap, cfg = DEFAULTS, cash = Infinity) {
  const elapsed = snap.now - snap.start;
  if (elapsed < cfg.enterAfterSec) return { action: 'skip', reason: 'too early' };
  if (elapsed > WINDOW_SEC - cfg.enterBeforeSec) return { action: 'skip', reason: 'too late' };
  const up = bestAsk(snap.books.Up);
  const down = bestAsk(snap.books.Down);
  if (up == null || down == null) return { action: 'skip', reason: 'empty book' };
  const side = up <= down ? 'Up' : 'Down';
  const price = Math.min(up, down);
  if (price < cfg.minPrice) return { action: 'skip', reason: `underdog ${side} at ${cents(price)} is below ${cents(cfg.minPrice)}`, side, price };
  if (price > cfg.maxPrice) return { action: 'skip', reason: `underdog ${side} at ${cents(price)} is above ${cents(cfg.maxPrice)}`, side, price };
  const usd = Math.min(cfg.stake, cash);
  if (usd < 1) return { action: 'skip', reason: 'not enough cash' };
  const limit = Math.min(cfg.maxPrice, price + cfg.maxSlippage);
  const fill = fillFromAsks(snap.books[side].asks, usd, limit, cfg);
  if (!fill) return { action: 'skip', reason: 'nothing to buy at the limit' };
  return { action: 'buy', side, price, fill };
}

export function cents(p) {
  return `${(p * 100).toFixed(1).replace(/\.0$/, '')}¢`;
}

/** Paper account: cash, open positions and settled trades. Plain JSON in and out. */
export class Ledger {
  constructor(cfg = DEFAULTS, state = null) {
    this.cfg = { ...DEFAULTS, ...cfg };
    this.cash = state?.cash ?? this.cfg.startBalance;
    this.startBalance = state?.startBalance ?? this.cfg.startBalance;
    this.open = state?.open ?? [];
    this.closed = state?.closed ?? [];
    this.seen = new Set(state?.seen ?? []);
  }

  toJSON() {
    // keep the "already looked at" list short; only recent windows matter
    const seen = [...this.seen].slice(-500);
    return { cash: this.cash, startBalance: this.startBalance, open: this.open, closed: this.closed, seen };
  }

  /** Records a buy from decide(). */
  buy(market, d, at) {
    const pos = {
      slug: market.slug,
      title: market.title,
      start: market.start,
      end: market.start + WINDOW_SEC,
      side: d.side,
      shares: d.fill.shares,
      avg: d.fill.avg,
      cost: d.fill.cost,
      fee: d.fill.fee,
      at,
    };
    this.cash -= pos.cost + pos.fee;
    this.open.push(pos);
    this.seen.add(market.slug);
    return pos;
  }

  /** Settles an open position once the market resolves. `winner` is 'Up' or 'Down'. */
  settle(slug, winner) {
    const i = this.open.findIndex((p) => p.slug === slug);
    if (i < 0) return null;
    const pos = this.open.splice(i, 1)[0];
    const won = pos.side === winner;
    const payout = won ? pos.shares : 0;
    this.cash += payout;
    const t = { ...pos, winner, won, payout, pnl: payout - pos.cost - pos.fee };
    this.closed.push(t);
    return t;
  }

  stats() {
    return summarize(this.closed, this.startBalance, this.open);
  }
}

/** Results of a list of settled trades. */
export function summarize(trades, startBalance = DEFAULTS.startBalance, open = []) {
  const n = trades.length;
  const wins = trades.filter((t) => t.won).length;
  const pnl = trades.reduce((s, t) => s + t.pnl, 0);
  const spent = trades.reduce((s, t) => s + t.cost + t.fee, 0);
  const shares = trades.reduce((s, t) => s + t.shares, 0);
  const fees = trades.reduce((s, t) => s + t.fee, 0);
  // all-in cost per share is the hit rate needed to break even
  const breakeven = shares ? spent / shares : 0;
  let eq = startBalance;
  let peak = eq;
  let maxDD = 0;
  let streak = 0;
  let worstStreak = 0;
  const curve = [eq];
  for (const t of trades) {
    eq += t.pnl;
    curve.push(eq);
    peak = Math.max(peak, eq);
    maxDD = Math.max(maxDD, peak - eq);
    streak = t.won ? 0 : streak + 1;
    worstStreak = Math.max(worstStreak, streak);
  }
  const openCost = open.reduce((s, p) => s + p.cost + p.fee, 0);
  return {
    trades: n,
    wins,
    hitRate: n ? wins / n : 0,
    breakeven,
    pnl,
    fees,
    roi: spent ? pnl / spent : 0,
    avgEntry: shares ? trades.reduce((s, t) => s + t.cost, 0) / shares : 0,
    maxDrawdown: maxDD,
    worstLosingStreak: worstStreak,
    equity: startBalance + pnl,
    openCount: open.length,
    openCost,
    curve,
  };
}

/** Hit rate by entry-price bucket: is the market's price a fair estimate of the odds? */
export function calibration(trades, width = 0.05) {
  const buckets = new Map();
  for (const t of trades) {
    const lo = Math.floor(t.avg / width + 1e-9) * width;
    const b = buckets.get(lo) ?? { lo, hi: lo + width, n: 0, wins: 0, priceSum: 0, pnl: 0 };
    b.n++;
    b.wins += t.won ? 1 : 0;
    b.priceSum += t.avg;
    b.pnl += t.pnl;
    buckets.set(lo, b);
  }
  return [...buckets.values()]
    .sort((a, b) => a.lo - b.lo)
    .map((b) => ({ ...b, hitRate: b.wins / b.n, avgPrice: b.priceSum / b.n }));
}
