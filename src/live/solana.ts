/**
 * Read-only Solana data. Every call here is a public read (balances, token
 * accounts, transaction signatures, prices). Nothing in this file can sign
 * or send a transaction.
 */

export const DEFAULT_RPC = 'https://api.mainnet-beta.solana.com';
const TOKEN_PROGRAMS = [
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', // SPL Token
  'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb', // Token-2022
];

/** Mints we can price. Anything else is shown but not counted in the USD total. */
export const KNOWN_MINTS: Record<string, { symbol: string; coingeckoId: string }> = {
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: { symbol: 'USDC', coingeckoId: 'usd-coin' },
  Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCdh3qFK3HM: { symbol: 'USDT', coingeckoId: 'tether' },
};

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
export const isValidAddress = (a: string) => BASE58.test(a.trim());

export type Fetch = typeof fetch;

export async function rpc<T>(url: string, method: string, params: unknown[], f: Fetch = fetch): Promise<T> {
  const res = await f(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`RPC ${method} failed: HTTP ${res.status}`);
  const body = await res.json();
  if (body.error) throw new Error(`RPC ${method} failed: ${body.error.message ?? 'unknown error'}`);
  return body.result as T;
}

export async function getSolBalance(rpcUrl: string, owner: string, f: Fetch = fetch): Promise<number> {
  const r = await rpc<{ value: number }>(rpcUrl, 'getBalance', [owner, { commitment: 'confirmed' }], f);
  return r.value / 1e9;
}

export interface TokenBalance {
  mint: string;
  symbol: string | null;
  amount: number;
}

interface ParsedTokenAccounts {
  value: { account: { data: { parsed: { info: { mint: string; tokenAmount: { uiAmountString: string } } } } } }[];
}

export async function getTokenBalances(rpcUrl: string, owner: string, f: Fetch = fetch): Promise<TokenBalance[]> {
  const byMint = new Map<string, number>();
  for (const programId of TOKEN_PROGRAMS) {
    const r = await rpc<ParsedTokenAccounts>(rpcUrl, 'getTokenAccountsByOwner',
      [owner, { programId }, { encoding: 'jsonParsed', commitment: 'confirmed' }], f);
    for (const acc of r.value) {
      const info = acc.account.data.parsed.info;
      const amt = Number(info.tokenAmount.uiAmountString);
      if (amt > 0) byMint.set(info.mint, (byMint.get(info.mint) ?? 0) + amt);
    }
  }
  return [...byMint.entries()]
    .map(([mint, amount]) => ({ mint, amount, symbol: KNOWN_MINTS[mint]?.symbol ?? null }))
    .sort((a, b) => Number(b.symbol !== null) - Number(a.symbol !== null) || b.amount - a.amount);
}

export interface Activity {
  signature: string;
  blockTime: number | null;
  failed: boolean;
}

export async function getRecentActivity(rpcUrl: string, owner: string, limit = 10, f: Fetch = fetch): Promise<Activity[]> {
  const r = await rpc<{ signature: string; blockTime: number | null; err: unknown }[]>(
    rpcUrl, 'getSignaturesForAddress', [owner, { limit }], f);
  return r.map((s) => ({ signature: s.signature, blockTime: s.blockTime, failed: s.err !== null }));
}

/** USD prices keyed by coingecko id. Returns {} on failure so the UI can say "unpriced" instead of guessing. */
export async function getUsdPrices(ids: string[], f: Fetch = fetch): Promise<Record<string, number>> {
  try {
    const res = await f(`https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(',')}&vs_currencies=usd`);
    if (!res.ok) return {};
    const body = (await res.json()) as Record<string, { usd?: number }>;
    return Object.fromEntries(Object.entries(body).filter(([, v]) => typeof v.usd === 'number').map(([k, v]) => [k, v.usd!]));
  } catch {
    return {};
  }
}

export interface WalletSnapshot {
  address: string;
  sol: number;
  tokens: TokenBalance[];
  activity: Activity[];
  prices: Record<string, number>;
  /** USD value of SOL plus tokens we could price. Never includes unpriced tokens. */
  pricedUsd: number | null;
  unpricedTokens: number;
  fetchedAt: number;
}

export function valueSnapshot(sol: number, tokens: TokenBalance[], prices: Record<string, number>) {
  if (prices.solana === undefined) return { pricedUsd: null, unpricedTokens: tokens.length };
  let usd = sol * prices.solana;
  let unpriced = 0;
  for (const t of tokens) {
    const id = KNOWN_MINTS[t.mint]?.coingeckoId;
    if (id && prices[id] !== undefined) usd += t.amount * prices[id];
    else unpriced++;
  }
  return { pricedUsd: usd, unpricedTokens: unpriced };
}

export async function loadWallet(rpcUrl: string, address: string, f: Fetch = fetch): Promise<WalletSnapshot> {
  const [sol, tokens, activity, prices] = await Promise.all([
    getSolBalance(rpcUrl, address, f),
    getTokenBalances(rpcUrl, address, f),
    getRecentActivity(rpcUrl, address, 10, f),
    getUsdPrices(['solana', ...Object.values(KNOWN_MINTS).map((m) => m.coingeckoId)], f),
  ]);
  return { address, sol, tokens, activity, prices, ...valueSnapshot(sol, tokens, prices), fetchedAt: Date.now() };
}
