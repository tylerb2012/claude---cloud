/**
 * Live paper trader. Watches each Bitcoin Up or Down 5-minute market on Polymarket, paper-buys
 * the underdog side when its ask is in the price band, and settles it when the market resolves.
 * Reads public data only. Never places an order.
 *
 * Usage: node poly/run.mjs [--stake 500] [--min 0.2] [--max 0.35] [--balance 10000]
 *                          [--file poly/data/ledger.json] [--reset] [--every 3]
 * Leave it running; stop with Ctrl+C. The ledger file keeps the account between runs.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { cents, decide, DEFAULTS, Ledger, slotStart } from './engine.js';
import { getBooks, getMarket } from './api.js';

const args = process.argv.slice(2);
const arg = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const FILE = arg('file', 'poly/data/ledger.json');
const EVERY_MS = Number(arg('every', 3)) * 1000;
const cfg = {
  ...DEFAULTS,
  stake: Number(arg('stake', DEFAULTS.stake)),
  minPrice: Number(arg('min', DEFAULTS.minPrice)),
  maxPrice: Number(arg('max', DEFAULTS.maxPrice)),
  startBalance: Number(arg('balance', DEFAULTS.startBalance)),
};

const state = !args.includes('--reset') && existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')) : null;
const ledger = new Ledger(cfg, state);
const save = () => {
  mkdirSync(dirname(FILE), { recursive: true });
  writeFileSync(FILE, JSON.stringify({ cfg, ...ledger.toJSON() }, null, 1));
};

const usd = (n) => `${n < 0 ? '-' : ''}$${Math.abs(n).toFixed(2)}`;
const time = (s) => new Date(s * 1000).toISOString().slice(11, 19);
const log = (msg) => console.log(`${new Date().toISOString().slice(11, 19)}  ${msg}`);

function printStats() {
  const s = ledger.stats();
  log(
    `account ${usd(s.equity)} (${s.pnl >= 0 ? '+' : ''}${usd(s.pnl)}) | ${s.trades} settled, ` +
      `hit ${(s.hitRate * 100).toFixed(1)}% vs ${(s.breakeven * 100).toFixed(1)}% to break even | ${s.openCount} open`,
  );
}

let market = null;
let lastSkip = '';

async function tick() {
  const now = Date.now() / 1000;
  const start = slotStart(now);

  // 1. settle anything whose window has ended
  for (const pos of [...ledger.open]) {
    if (now < pos.end + 15) continue;
    const m = await getMarket(pos.start);
    if (!m?.winner) continue;
    const t = ledger.settle(pos.slug, m.winner);
    log(`${t.won ? 'WON ' : 'LOST'} ${t.title}: had ${t.side} at ${cents(t.avg)}, ${m.winner} won -> ${t.pnl >= 0 ? '+' : ''}${usd(t.pnl)}`);
    printStats();
    save();
  }

  // 2. look for an entry in the current window
  if (ledger.seen.has(`btc-updown-5m-${start}`)) return;
  if (!market || market.start !== start) {
    market = await getMarket(start);
    lastSkip = '';
    if (!market) return;
    log(`watching ${market.title}`);
  }
  const books = await getBooks(market);
  const d = decide({ start, now: Date.now() / 1000, books }, cfg, ledger.cash);
  if (d.action === 'buy') {
    const p = ledger.buy(market, d, Math.floor(now));
    log(`BUY  ${p.side} ${p.shares.toFixed(1)} sh at ${cents(p.avg)} = ${usd(p.cost)} + ${usd(p.fee)} fee (pays ${usd(p.shares)} if ${p.side} wins at ${time(p.end)})`);
    save();
  } else if (d.reason !== lastSkip && d.reason !== 'too early') {
    lastSkip = d.reason;
    if (d.reason === 'too late') {
      log(`no entry this window`);
      ledger.seen.add(market.slug);
      save();
    } else log(`skip: ${d.reason}`);
  }
}

log(`paper trader started: buy the underdog at ${cents(cfg.minPrice)}-${cents(cfg.maxPrice)}, ${usd(cfg.stake)} a trade. Ledger: ${FILE}`);
printStats();
save();
let busy = false;
setInterval(async () => {
  if (busy) return;
  busy = true;
  try {
    await tick();
  } catch (e) {
    log(`error: ${e.message}`);
  } finally {
    busy = false;
  }
}, EVERY_MS);
process.on('SIGINT', () => {
  save();
  printStats();
  process.exit(0);
});
