/** Shared data access for the real-data test and the strategy lab. Read-only public data. */
import { createReadStream, createWriteStream } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createGunzip } from 'node:zlib';
import StreamArray from 'stream-json/streamers/StreamArray.js';

export const ARCHIVE_URL = 'https://whale-alert.io/whale-alerts-archive.json.gzip';
const HL = 'https://api.hyperliquid.xyz/info';
export const STABLES = new Set(['USDT', 'USDC', 'BUSD', 'DAI', 'TUSD', 'USDP', 'FDUSD', 'PYUSD', 'USDE', 'EURC', 'USDS', 'USD1', 'RLUSD', 'USDD', 'GUSD']);
const ALIASES = { WBTC: 'BTC', WETH: 'ETH', STETH: 'ETH', WSOL: 'SOL' };

export function arg(k, d) {
  const i = process.argv.indexOf(`--${k}`);
  return i >= 0 ? process.argv[i + 1] : d;
}

/** POST to Hyperliquid's public info API, with retries. */
export async function hl(body) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(HL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (res.ok) return res.json();
    await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
  }
  throw new Error(`Hyperliquid request failed: ${JSON.stringify(body)}`);
}

/** Coins with a live Hyperliquid perp. */
export async function perpCoins() {
  const [meta] = await hl({ type: 'metaAndAssetCtxs' });
  return new Set(meta.universe.filter((u) => !u.isDelisted).map((u) => u.name));
}

/** Path to the archive: --archive if given, otherwise downloads it to a temp file. */
export async function getArchive() {
  const local = arg('archive', null);
  if (local) return local;
  const path = join(tmpdir(), 'whale-alerts-archive.json.gz');
  const res = await fetch(ARCHIVE_URL);
  if (!res.ok) throw new Error(`archive download failed: HTTP ${res.status}`);
  await pipeline(res.body, createWriteStream(path));
  return path;
}

/** Streams the archive and returns transfers from a non-exchange wallet into an exchange. */
export async function readSignals(path, coins, sinceSec, minUsd = 1_000_000) {
  const out = [];
  let lastAlert = 0;
  const stream = createReadStream(path).pipe(createGunzip()).pipe(StreamArray.withParser());
  for await (const { value: a } of stream) {
    lastAlert = Math.max(lastAlert, a.timestamp || 0);
    if (a.transaction_type !== 'transfer' || (a.timestamp || 0) < sinceSec) continue;
    const subs = (a.transaction && a.transaction.sub_transactions) || [];
    const outs = subs.flatMap((s) => s.outputs || []);
    const ins = subs.flatMap((s) => s.inputs || []);
    const toEx = outs.find((o) => o.owner_type === 'exchange');
    if (!toEx || ins.some((i) => i.owner_type === 'exchange')) continue;
    const amt = (a.amounts || [])[0] || {};
    const raw = String(amt.symbol || '').toUpperCase();
    const coin = ALIASES[raw] || raw;
    if (STABLES.has(coin) || !coins.has(coin) || (amt.value_usd || 0) < minUsd) continue;
    out.push({
      ts: a.timestamp,
      coin,
      usd: amt.value_usd,
      from: a.from || 'unknown wallet',
      to: toEx.owner || a.to || 'exchange',
      hash: (a.transaction && a.transaction.hash) || `${a.timestamp}-${coin}`,
    });
  }
  return { signals: out, lastAlert };
}
