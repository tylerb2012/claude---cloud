/**
 * Real-data test of the wallet-monitor signal. Paper only: reads public data, places no orders.
 *
 * 1. Reads Whale Alert's free historical alert archive (transfers posted on X/Telegram).
 * 2. Keeps transfers from a non-exchange wallet INTO an exchange, in coins with a Hyperliquid perp.
 * 3. For each one, opens a paper short at the next 15-minute candle and runs the desk's own
 *    exit rules (two-step take-profit, stop, trail, 1-hour limit, fees) on Hyperliquid's real candles.
 * 4. Runs the same rules at random times on the same coin (the control group).
 * 5. Writes public/forward/results.json (shown on the desk) and forward/REPORT.md.
 *
 * Usage: node forward/run.mjs [--archive path.json.gz] [--days 50]
 * Without --archive it downloads https://whale-alert.io/whale-alerts-archive.json.gzip.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRng, DEFAULTS, manageBar, newPosition } from '../desk/engine.js';
import { arg, getArchive, hl, readSignals } from './lib.mjs';

const DAYS = Number(arg('days', 50));
const INTERVAL = arg('interval', '15m');
const BAR_MIN = { '5m': 5, '15m': 15, '1h': 60 }[INTERVAL];
if (!BAR_MIN) throw new Error('--interval must be 5m, 15m or 1h');
const BAR_MS = BAR_MIN * 60 * 1000;
const H1 = 60 / BAR_MIN; // bars in one hour
const H4 = 240 / BAR_MIN;
const CONTROLS_PER_SIGNAL = 5;
const MIN_USD = 1_000_000;

/** The desk's rules with the same 60-minute holding limit, in bars of the chosen size. */
const RULES = { ...DEFAULTS, maxBars: H1, leverage: 10 };
const MARGIN = 100; // $ per trade: 10% of a $1,000 paper account, fixed so trades are comparable

/** Runs the desk's exit rules on real candles starting at bar index i. */
function simulate(candles, i) {
  const entry = candles[i].o;
  const p = newPosition({ funding: 0, tp2Pct: null }, entry, MARGIN, RULES);
  let reason = 'time exit';
  for (let k = i; k < candles.length && k < i + RULES.maxBars; k++) {
    // the entry bar itself can hit levels after the open
    const r = manageBar(p, candles[k], RULES);
    if (r.closed) {
      reason = r.closed;
      break;
    }
  }
  if (p.qtyOpen > 1e-12) {
    // window ran out of candles: close at the last close seen
    const last = candles[Math.min(candles.length - 1, i + RULES.maxBars - 1)];
    p.realized += p.qtyOpen * (p.entry - last.c) - p.qtyOpen * last.c * RULES.takerFee;
    p.qtyOpen = 0;
  }
  const ret = (k) => (candles[i + k - 1] ? 1 - candles[i + k - 1].c / entry : null); // short return after k bars
  return { entry, pnl: p.realized, roe: p.realized / MARGIN, reason, ret1h: ret(H1), ret4h: ret(H4) };
}

function stats(xs) {
  const v = xs.filter((x) => x !== null && Number.isFinite(x));
  const n = v.length;
  if (!n) return { n: 0, mean: 0, sd: 0, se: 0 };
  const mean = v.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, n - 1));
  return { n, mean, sd, se: sd / Math.sqrt(n) };
}

function summarize(trades) {
  const roe = stats(trades.map((t) => t.roe));
  return {
    n: trades.length,
    meanPnl: stats(trades.map((t) => t.pnl)).mean,
    totalPnl: trades.reduce((s, t) => s + t.pnl, 0),
    meanRoe: roe.mean,
    seRoe: roe.se,
    winRate: trades.length ? trades.filter((t) => t.pnl > 0).length / trades.length : 0,
    ret1h: stats(trades.map((t) => t.ret1h)),
    ret4h: stats(trades.map((t) => t.ret4h)),
    reasons: trades.reduce((m, t) => ((m[t.reason] = (m[t.reason] || 0) + 1), m), {}),
  };
}

/** Welch t-statistic for the difference in means. */
function tStat(a, b) {
  const se = Math.sqrt(a.se ** 2 + b.se ** 2);
  return se ? (a.mean - b.mean) / se : 0;
}

async function main() {
  const [meta] = await hl({ type: 'metaAndAssetCtxs' });
  const coins = new Set(meta.universe.filter((u) => !u.isDelisted).map((u) => u.name));
  const now = Date.now();
  const since = Math.floor((now - DAYS * 86400_000) / 1000);
  const archive = await getArchive();
  const { signals, lastAlert } = await readSignals(archive, coins, since);
  console.log(`archive last alert ${new Date(lastAlert * 1000).toISOString()}, ${signals.length} exchange-bound signals in ${DAYS} days`);

  const byCoin = {};
  for (const s of signals) (byCoin[s.coin] ??= []).push(s);
  const sigTrades = [];
  const ctlTrades = [];
  for (const [coin, list] of Object.entries(byCoin)) {
    const raw = await hl({ type: 'candleSnapshot', req: { coin, interval: INTERVAL, startTime: since * 1000 - BAR_MS * 4, endTime: now } });
    const candles = raw.map((c) => ({ t: c.t, o: +c.o, h: +c.h, l: +c.l, c: +c.c, vol: +c.v }));
    if (candles.length < 40) continue;
    const firstT = candles[0].t;
    for (const s of list) {
      // can't act before the alert: enter at the open of the first bar starting at least a minute after it
      const i = candles.findIndex((c) => c.t >= s.ts * 1000 + 60_000);
      if (i < 0 || i + H4 > candles.length) continue; // need 4 hours of data after entry
      if (candles[0].t > s.ts * 1000) continue;
      const r = simulate(candles, i);
      sigTrades.push({ ...s, ...r, time: new Date(candles[i].t).toISOString() });
      // control: same coin, same rules, random entry times inside the covered window
      const rng = createRng(Number.parseInt(String(s.hash).slice(-8), 16) || s.ts);
      for (let k = 0; k < CONTROLS_PER_SIGNAL; k++) {
        const j = 1 + rng.int(candles.length - H4 - 1);
        if (candles[j].t < firstT) continue;
        ctlTrades.push({ coin, ...simulate(candles, j) });
      }
    }
    console.log(`${coin}: ${list.length} alerts, ${candles.length} candles`);
  }

  const sig = summarize(sigTrades);
  const ctl = summarize(ctlTrades);
  const result = {
    generatedAt: new Date(now).toISOString(),
    archiveLastAlert: new Date(lastAlert * 1000).toISOString(),
    windowDays: DAYS,
    candleInterval: INTERVAL,
    rules: { leverage: RULES.leverage, marginUsd: MARGIN, tp1: RULES.tp1, tp2: RULES.tp2, stop: RULES.stop, trail: RULES.trail, holdMinutes: RULES.maxBars * BAR_MIN, makerFee: RULES.makerFee, takerFee: RULES.takerFee, minTransferUsd: MIN_USD },
    signal: sig,
    control: ctl,
    tRoe: tStat({ mean: sig.meanRoe, se: sig.seRoe }, { mean: ctl.meanRoe, se: ctl.seRoe }),
    tRet1h: tStat(sig.ret1h, ctl.ret1h),
    tRet4h: tStat(sig.ret4h, ctl.ret4h),
    coins: Object.fromEntries(Object.entries(byCoin).map(([k, v]) => [k, v.length])),
    trades: sigTrades.sort((a, b) => b.ts - a.ts).slice(0, 300).map((t) => ({
      time: t.time, coin: t.coin, usdM: Math.round(t.usd / 1e5) / 10, to: t.to, reason: t.reason,
      pnl: Math.round(t.pnl * 100) / 100, ret1h: t.ret1h, ret4h: t.ret4h,
    })),
  };
  const out = arg('out', 'public/forward/results.json');
  mkdirSync('public/forward', { recursive: true });
  writeFileSync(out, JSON.stringify(result, null, 1));
  if (!arg('out', null)) writeFileSync('forward/REPORT.md', report(result));
  console.log(report(result));
}

function pct(x, d = 2) {
  return `${x >= 0 ? '+' : '−'}${Math.abs(x * 100).toFixed(d)}%`;
}

function report(r) {
  const s = r.signal, c = r.control;
  const verdict = Math.abs(r.tRoe) < 2
    ? 'No reliable difference: whale-alert shorts did not beat random shorts by more than chance would explain.'
    : r.tRoe > 0
      ? 'Whale-alert shorts beat random shorts by more than chance would usually explain. Keep testing before trusting it: one window can mislead.'
      : 'Whale-alert shorts did worse than random shorts.';
  return `# Real-data test: whale transfers to exchanges

Generated ${r.generatedAt} · archive up to ${r.archiveLastAlert} · last ${r.windowDays} days · ${r.candleInterval} Hyperliquid candles · paper only

Rules: short at the next candle after the alert, ${r.rules.leverage}x, $${r.rules.marginUsd} margin, TP1 ${pct(-r.rules.tp1, 1)} (half), TP2 ${pct(-r.rules.tp2, 1)}, stop ${pct(r.rules.stop, 1)}, trailing after TP1, ${r.rules.holdMinutes}-minute limit, maker/taker fees.

| | Whale-alert shorts | Random-time shorts (control) |
|---|---|---|
| Trades | ${s.n} | ${c.n} |
| Avg P&L per trade | $${s.meanPnl.toFixed(2)} | $${c.meanPnl.toFixed(2)} |
| Avg return on margin | ${pct(s.meanRoe)} ± ${(s.seRoe * 100).toFixed(2)}% | ${pct(c.meanRoe)} ± ${(c.seRoe * 100).toFixed(2)}% |
| Win rate | ${(s.winRate * 100).toFixed(0)}% | ${(c.winRate * 100).toFixed(0)}% |
| Price move 1h after (short's view) | ${pct(s.ret1h.mean, 3)} | ${pct(c.ret1h.mean, 3)} |
| Price move 4h after (short's view) | ${pct(s.ret4h.mean, 3)} | ${pct(c.ret4h.mean, 3)} |
| Total P&L | $${s.totalPnl.toFixed(2)} | (scaled) $${(c.totalPnl / Math.max(1, c.n) * s.n).toFixed(2)} |

Difference vs control, t-statistic: return on margin ${r.tRoe.toFixed(2)}, 1h move ${r.tRet1h.toFixed(2)}, 4h move ${r.tRet4h.toFixed(2)} (about ±2 or beyond would be notable).

**Verdict:** ${verdict}
`;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
