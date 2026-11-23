/**
 * Read-only access to Polymarket's public APIs (no key, no account). Works in Node 18+ and in
 * the browser: both hosts send `Access-Control-Allow-Origin: *`.
 */
import { slugFor, WINDOW_SEC } from './engine.js';

const GAMMA = 'https://gamma-api.polymarket.com';
const CLOB = 'https://clob.polymarket.com';

async function getJSON(url, tries = 3) {
  let err;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url);
      if (r.status === 429 || r.status >= 500) throw new Error(`HTTP ${r.status}`);
      if (!r.ok) throw Object.assign(new Error(`HTTP ${r.status} for ${url}`), { fatal: true });
      return await r.json();
    } catch (e) {
      err = e;
      if (e.fatal) break;
      await new Promise((res) => setTimeout(res, 500 * 2 ** i));
    }
  }
  throw err;
}

const parse = (v) => (typeof v === 'string' ? JSON.parse(v) : v);

/**
 * The 5-minute market that starts at `start` (unix seconds), or null if it doesn't exist yet.
 * winner is 'Up' / 'Down' once resolved, else null.
 */
export async function getMarket(start) {
  const slug = slugFor(start);
  const events = await getJSON(`${GAMMA}/events?slug=${slug}`);
  const ev = events[0];
  if (!ev?.markets?.length) return null;
  const m = ev.markets[0];
  const outcomes = parse(m.outcomes);
  const ids = parse(m.clobTokenIds);
  const prices = parse(m.outcomePrices ?? '[]').map(Number);
  const tokens = Object.fromEntries(outcomes.map((o, i) => [o, ids[i]]));
  let winner = null;
  if (m.closed && prices.length === 2) {
    const w = prices.findIndex((p) => p >= 0.99);
    if (w >= 0 && prices[1 - w] <= 0.01) winner = outcomes[w];
  }
  return {
    slug,
    title: ev.title,
    start,
    end: start + WINDOW_SEC,
    tokens,
    closed: !!m.closed,
    winner,
    priceToBeat: ev.eventMetadata?.priceToBeat ?? null,
    finalPrice: ev.eventMetadata?.finalPrice ?? null,
  };
}

/** Order book for one outcome token: asks ascending, bids descending, as {p, s} numbers. */
export async function getBook(tokenId) {
  const b = await getJSON(`${CLOB}/book?token_id=${tokenId}`);
  const conv = (rows) => rows.map((r) => ({ p: Number(r.price), s: Number(r.size) }));
  return {
    asks: conv(b.asks ?? []).sort((a, c) => a.p - c.p),
    bids: conv(b.bids ?? []).sort((a, c) => c.p - a.p),
  };
}

export async function getBooks(market) {
  const [Up, Down] = await Promise.all([getBook(market.tokens.Up), getBook(market.tokens.Down)]);
  return { Up, Down };
}

/** Minute-by-minute traded price of one outcome token between two unix times. */
export async function getHistory(tokenId, startTs, endTs) {
  const h = await getJSON(`${CLOB}/prices-history?market=${tokenId}&startTs=${startTs}&endTs=${endTs}&fidelity=1`);
  return (h.history ?? []).map((x) => ({ t: x.t, p: Number(x.p) }));
}
