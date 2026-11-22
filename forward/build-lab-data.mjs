/**
 * Builds public/forward/lab-data.json for the desk's strategy lab: real whale transfers into
 * exchanges plus Hyperliquid's real hourly candles for each coin. Read-only public data.
 *
 * Usage: node forward/build-lab-data.mjs [--archive path.json.gz] [--days 200] [--holdout 50]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { arg, getArchive, hl, perpCoins, readSignals } from './lib.mjs';
import { exchangeGroup } from '../desk/lab.js';

const DAYS = Number(arg('days', 200));
const HOLDOUT_DAYS = Number(arg('holdout', 50));
const HOUR = 3600_000;

const sig6 = (x) => Number(x.toPrecision(6));

async function main() {
  const coins = await perpCoins();
  const now = Date.now();
  const since = Math.floor((now - DAYS * 86400_000) / 1000);
  const { signals, lastAlert } = await readSignals(await getArchive(), coins, since);
  const byCoin = [...new Set(signals.map((s) => s.coin))];
  const candles = {};
  for (const coin of byCoin) {
    const raw = await hl({ type: 'candleSnapshot', req: { coin, interval: '1h', startTime: since * 1000 - 4 * HOUR, endTime: now } });
    if (raw.length < 100) continue;
    candles[coin] = {
      t: raw.map((c) => c.t / 1000),
      o: raw.map((c) => sig6(+c.o)),
      h: raw.map((c) => sig6(+c.h)),
      l: raw.map((c) => sig6(+c.l)),
      c: raw.map((c) => sig6(+c.c)),
    };
    console.log(`${coin}: ${raw.length} hourly candles`);
  }
  const lastCandle = Math.max(...Object.values(candles).map((c) => c.t[c.t.length - 1]));
  const data = {
    generatedAt: new Date(now).toISOString(),
    archiveLastAlert: new Date(lastAlert * 1000).toISOString(),
    interval: '1h',
    days: DAYS,
    holdoutDays: HOLDOUT_DAYS,
    splitTs: Math.floor(lastCandle - HOLDOUT_DAYS * 86400),
    coins: candles,
    // [unix seconds, coin, $M, exchange group, exchange name]
    alerts: signals
      .filter((s) => candles[s.coin])
      .sort((a, b) => a.ts - b.ts)
      .map((s) => [s.ts, s.coin, Math.round(s.usd / 1e5) / 10, exchangeGroup(s.to), s.to]),
  };
  mkdirSync('public/forward', { recursive: true });
  writeFileSync('public/forward/lab-data.json', JSON.stringify(data));
  console.log(`${data.alerts.length} alerts, ${Object.keys(candles).length} coins, holdout from ${new Date(data.splitTs * 1000).toISOString()}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
