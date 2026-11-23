/**
 * Replays the strategy on recent, already-settled 5-minute markets using Polymarket's
 * minute-by-minute price history.
 *
 * Limits, so read results with care:
 * - History is the last traded price about once a minute, not the order book. The entry price
 *   is that price plus `--spread` (default 1c) to stand in for buying at the ask.
 * - The Down price is taken as 1 - Up.
 * - Fills ignore book depth.
 *
 * Usage: node poly/backtest.mjs [--hours 24] [--stake 500] [--min 0.2] [--max 0.35] [--spread 0.01]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { calibration, cents, DEFAULTS, slotStart, summarize, takerFee, WINDOW_SEC } from './engine.js';
import { getHistory, getMarket } from './api.js';

const args = process.argv.slice(2);
const arg = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const HOURS = Number(arg('hours', 24));
const SPREAD = Number(arg('spread', 0.01));
const cfg = {
  ...DEFAULTS,
  stake: Number(arg('stake', DEFAULTS.stake)),
  minPrice: Number(arg('min', DEFAULTS.minPrice)),
  maxPrice: Number(arg('max', DEFAULTS.maxPrice)),
};

function paperTrade(m, side, price, at) {
  const perShare = price + takerFee(1, price, cfg);
  const shares = cfg.stake / perShare;
  const cost = shares * price;
  const fee = takerFee(shares, price, cfg);
  const won = side === m.winner;
  const payout = won ? shares : 0;
  return { slug: m.slug, title: m.title, start: m.start, side, avg: price, shares, cost, fee, at, winner: m.winner, won, payout, pnl: payout - cost - fee };
}

async function study(start) {
  const m = await getMarket(start);
  if (!m?.winner) return null;
  const hist = await getHistory(m.tokens.Up, start, start + WINDOW_SEC);
  const inWindow = hist.filter((h) => h.t - start >= cfg.enterAfterSec && h.t - start <= WINDOW_SEC - cfg.enterBeforeSec);
  let strat = null;
  let first = null;
  for (const h of inWindow) {
    const side = h.p <= 0.5 ? 'Up' : 'Down';
    const price = Math.round((Math.min(h.p, 1 - h.p) + SPREAD) * 1000) / 1000;
    if (price <= 0 || price >= 1) continue;
    if (!first) first = paperTrade(m, side, price, h.t); // the underdog at the first look, any price
    if (!strat && price >= cfg.minPrice && price <= cfg.maxPrice) strat = paperTrade(m, side, price, h.t);
  }
  return { strat, first };
}

const last = slotStart(Date.now() / 1000) - WINDOW_SEC * 2; // skip windows that may not be resolved yet
const starts = [];
for (let s = last; s > last - HOURS * 3600; s -= WINDOW_SEC) starts.push(s);

console.log(`backtest: ${starts.length} markets over ${HOURS}h, underdog at ${cents(cfg.minPrice)}-${cents(cfg.maxPrice)}, $${cfg.stake} a trade, entry = last price + ${cents(SPREAD)}`);
const results = [];
let done = 0;
const queue = [...starts];
await Promise.all(
  Array.from({ length: 6 }, async () => {
    while (queue.length) {
      const s = queue.shift();
      try {
        const r = await study(s);
        if (r) results.push(r);
      } catch (e) {
        console.warn(`  ${s}: ${e.message}`);
      }
      if (++done % 24 === 0) process.stdout.write(`  ${done}/${starts.length}\n`);
    }
  }),
);

const byTime = (a, b) => a.start - b.start;
const trades = results.map((r) => r.strat).filter(Boolean).sort(byTime);
const firsts = results.map((r) => r.first).filter(Boolean).sort(byTime);
const s = summarize(trades);
const pct = (x) => `${(x * 100).toFixed(1)}%`;
const usd = (n) => `${n < 0 ? '-' : ''}$${Math.abs(n).toFixed(0)}`;

console.log(`\nSTRATEGY: ${s.trades} trades out of ${results.length} settled markets`);
console.log(`  hit rate ${pct(s.hitRate)} (${s.wins} wins); break-even needs ${pct(s.breakeven)}`);
console.log(`  P&L ${usd(s.pnl)} on ${usd(s.trades * cfg.stake)} staked (${pct(s.roi)} per dollar), fees ${usd(s.fees)}`);
console.log(`  max drawdown ${usd(s.maxDrawdown)}, longest losing streak ${s.worstLosingStreak}`);

const table = (rows) => {
  console.log('  price band   trades   hit rate   avg price   edge     P&L');
  for (const b of rows) {
    const edge = b.hitRate - b.avgPrice;
    console.log(
      `  ${cents(b.lo).padStart(5)}-${cents(b.hi).padEnd(5)} ${String(b.n).padStart(7)} ${pct(b.hitRate).padStart(10)} ${cents(b.avgPrice).padStart(11)} ${((edge >= 0 ? '+' : '') + (edge * 100).toFixed(1)).padStart(6)}pt ${usd(b.pnl).padStart(7)}`,
    );
  }
};
console.log(`\nSTRATEGY by entry price:`);
table(calibration(trades));
console.log(`\nCONTROL: underdog bought at the first look in every market, any price (is the market's price fair?):`);
table(calibration(firsts, 0.1));

mkdirSync('poly/data', { recursive: true });
writeFileSync('poly/data/backtest.json', JSON.stringify({ ranAt: new Date().toISOString(), hours: HOURS, spread: SPREAD, cfg, summary: { ...s, curve: undefined }, trades }, null, 1));
console.log('\nwrote poly/data/backtest.json');
