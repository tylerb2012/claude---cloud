/**
 * Strategy lab: replays a technique you configure on real whale alerts and real
 * hourly candles, against random entries, with the most recent period held back.
 * Paper only. Pure functions so the page can inline this and tests can import it.
 */
import { createRng } from './engine.js';

export const LAB_DEFAULTS = {
  side: 'short',
  leverage: 10,
  stopPct: 0.009,
  tp1Pct: 0.01,
  tp2Pct: 0.022,
  trail: true,
  trailPct: 0.009,
  holdHours: 1,
  minUsdM: 1,
  /** null = all */
  coins: /** @type {string[] | null} */ (null),
  /** null = all */
  exchanges: /** @type {string[] | null} */ (null),
  makerFee: 0.00015,
  takerFee: 0.00045,
  maintenance: 0.005,
  marginUsd: 100,
  controls: 5,
};

export const EXCHANGE_GROUPS = ['binance', 'coinbase', 'kraken', 'okx', 'bybit', 'bitfinex', 'other'];

export function exchangeGroup(name) {
  const n = String(name || '').toLowerCase();
  return EXCHANGE_GROUPS.find((g) => g !== 'other' && n.includes(g)) || 'other';
}

/**
 * One paper trade on real candles from bar i, for the chosen side and exits.
 * Adverse moves are checked before favorable ones within a bar (conservative),
 * stops that are jumped fill at the open, and liquidation takes the margin.
 */
export function simulateTrade(cd, i, p) {
  const dir = p.side === 'long' ? 1 : -1;
  const entry = cd.o[i];
  const margin = p.marginUsd;
  const qty = (margin * p.leverage) / entry;
  let qtyOpen = qty;
  let pnl = -margin * p.leverage * p.makerFee;
  const move = (k) => entry * (1 + dir * k); // price after a move of k in the trade's favor
  const liq = move(-(1 / p.leverage - p.maintenance));
  let stop = move(-p.stopPct);
  if (dir < 0) stop = Math.min(stop, liq * 0.999); else stop = Math.max(stop, liq * 1.001);
  const tp1 = move(p.tp1Pct), tp2 = move(p.tp2Pct);
  let tp1Done = false;
  let reason = 'time exit';
  const close = (frac, price, fee, isLiq) => {
    const q = qty * frac;
    pnl += isLiq ? -margin * frac : dir * q * (price - entry);
    pnl -= q * price * fee;
    qtyOpen -= q;
  };
  const worse = (a, b) => (dir < 0 ? a >= b : a <= b); // price a is at or beyond level b against the trade
  const better = (a, b) => (dir < 0 ? a <= b : a >= b);
  const last = Math.min(cd.o.length - 1, i + p.holdHours - 1);
  let k = i;
  for (; k <= last; k++) {
    const o = cd.o[k], adverse = dir < 0 ? cd.h[k] : cd.l[k], favor = dir < 0 ? cd.l[k] : cd.h[k];
    // liquidated if the bar opens past it, or reaches it while the stop sits beyond it
    if (worse(o, liq) || (worse(adverse, liq) && worse(stop, liq))) {
      close(qtyOpen / qty, liq, p.takerFee, true);
      reason = 'liquidated';
      break;
    }
    if (worse(o, stop)) {
      close(qtyOpen / qty, o, p.takerFee);
      reason = tp1Done ? 'trailing stop' : 'stop (gapped)';
      break;
    }
    if (worse(adverse, stop)) {
      close(qtyOpen / qty, stop, p.takerFee);
      reason = tp1Done ? 'trailing stop' : 'stop';
      break;
    }
    if (!tp1Done && better(favor, tp1)) {
      close(0.5, tp1, p.makerFee);
      tp1Done = true;
      stop = dir < 0 ? Math.min(stop, entry) : Math.max(stop, entry);
    }
    if (tp1Done && better(favor, tp2)) {
      close(qtyOpen / qty, tp2, p.makerFee);
      reason = 'take-profit 2';
      break;
    }
    if (tp1Done && p.trail) {
      const t = dir < 0 ? favor * (1 + p.trailPct) : favor * (1 - p.trailPct);
      stop = dir < 0 ? Math.min(stop, t) : Math.max(stop, t);
    }
  }
  if (qtyOpen > qty * 1e-9) close(qtyOpen / qty, cd.c[Math.min(k, last)], p.takerFee);
  return { pnl, roe: pnl / margin, reason };
}

function hashSeed(ts, coin) {
  let h = ts >>> 0;
  for (const ch of coin) h = Math.imul(h ^ ch.charCodeAt(0), 2654435761) >>> 0;
  return h;
}

function summarize(list) {
  const n = list.length;
  if (!n) return { n: 0, mean: 0, se: 0, win: 0, total: 0 };
  const mean = list.reduce((s, x) => s + x, 0) / n;
  const sd = Math.sqrt(list.reduce((s, x) => s + (x - mean) ** 2, 0) / Math.max(1, n - 1));
  return { n, mean, se: sd / Math.sqrt(n), win: list.filter((x) => x > 0).length / n, total: mean * n };
}

const tstat = (a, b) => {
  const se = Math.sqrt(a.se ** 2 + b.se ** 2);
  return se ? (a.mean - b.mean) / se : 0;
};

/** First candle index starting at or after unix-second ts (binary search). */
function barAt(t, ts) {
  let lo = 0, hi = t.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (t[mid] < ts) lo = mid + 1; else hi = mid;
  }
  return lo;
}

/**
 * Runs the configured technique on every matching alert and on random entries.
 * Returns stats for the training period, the held-back test period, and trades in time order.
 * @param {any} data lab-data.json
 * @param {Partial<typeof LAB_DEFAULTS>} params
 */
export function runLab(data, params = {}) {
  const p = { ...LAB_DEFAULTS, ...params };
  const trades = [];
  const ctl = { train: [], test: [] };
  for (const [ts, coin, usdM, ex] of data.alerts) {
    if (usdM < p.minUsdM) continue;
    if (p.coins && !p.coins.includes(coin)) continue;
    if (p.exchanges && !p.exchanges.includes(ex)) continue;
    const cd = data.coins[coin];
    if (!cd) continue;
    // can't act before the alert: enter at the first hourly bar opening a minute or more after it
    const i = barAt(cd.t, ts + 60);
    if (i >= cd.t.length || i + p.holdHours > cd.t.length || i === 0) continue;
    const period = ts >= data.splitTs ? 'test' : 'train';
    const r = simulateTrade(cd, i, p);
    trades.push({ ts, coin, usdM, ex, period, ...r });
    // control: random entries on the same coin, inside the same period
    const split = barAt(cd.t, data.splitTs);
    const lo = period === 'test' ? split : 1;
    const hi = (period === 'test' ? cd.t.length : split) - p.holdHours;
    if (hi <= lo) continue;
    const rng = createRng(hashSeed(ts, coin));
    for (let k = 0; k < p.controls; k++) {
      const j = lo + rng.int(hi - lo);
      ctl[period].push(simulateTrade(cd, j, p).pnl);
    }
  }
  /** @type {{ train: { signal: any, random: any, t: number }, test: { signal: any, random: any, t: number } }} */
  const out = /** @type {any} */ ({});
  for (const period of /** @type {const} */ (['train', 'test'])) {
    const sig = summarize(trades.filter((t) => t.period === period).map((t) => t.pnl));
    const rnd = summarize(ctl[period]);
    out[period] = { signal: sig, random: rnd, t: tstat(sig, rnd) };
  }
  const pass = out.train.signal.n >= 30 && out.test.signal.n >= 15
    && out.train.signal.mean > 0 && out.test.signal.mean > 0
    && out.train.t >= 2 && out.test.t >= 2;
  return { params: p, ...out, pass, trades };
}
