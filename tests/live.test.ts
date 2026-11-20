import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isValidAddress, loadWallet, valueSnapshot, type Fetch } from '../src/live/solana';

const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const MEME = 'MemeMint1111111111111111111111111111111111';
const ADDR = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';

const tokenAcc = (mint: string, ui: string) => ({ account: { data: { parsed: { info: { mint, tokenAmount: { uiAmountString: ui } } } } } });

/** Fake fetch returning responses shaped like the Solana JSON-RPC and CoinGecko docs. */
function fakeFetch(opts: { prices?: Record<string, { usd: number }> | 'fail'; rpcError?: string } = {}): Fetch {
  return (async (url: string, init?: RequestInit) => {
    const json = (body: unknown, ok = true) => ({ ok, status: ok ? 200 : 500, json: async () => body }) as Response;
    if (String(url).includes('coingecko')) {
      if (opts.prices === 'fail') return json({}, false);
      return json(opts.prices ?? { solana: { usd: 150 }, 'usd-coin': { usd: 1 }, tether: { usd: 1 } });
    }
    const { method, params } = JSON.parse(String(init!.body));
    if (opts.rpcError) return json({ jsonrpc: '2.0', id: 1, error: { message: opts.rpcError } });
    switch (method) {
      case 'getBalance':
        return json({ jsonrpc: '2.0', id: 1, result: { context: { slot: 1 }, value: 2_500_000_000 } });
      case 'getTokenAccountsByOwner':
        return json({
          jsonrpc: '2.0', id: 1,
          result: {
            value: params[1].programId.startsWith('Tokenkeg')
              ? [tokenAcc(USDC, '10.5'), tokenAcc(MEME, '1000'), tokenAcc(MEME, '0')]
              : [],
          },
        });
      case 'getSignaturesForAddress':
        return json({ jsonrpc: '2.0', id: 1, result: [{ signature: 'sig1', blockTime: 1700000000, err: null }, { signature: 'sig2', blockTime: null, err: { x: 1 } }] });
    }
    throw new Error('unexpected ' + method);
  }) as Fetch;
}

describe('live wallet data', () => {
  it('reads SOL, tokens and activity', async () => {
    const s = await loadWallet('rpc', ADDR, fakeFetch());
    expect(s.sol).toBe(2.5);
    expect(s.tokens).toEqual([
      { mint: USDC, symbol: 'USDC', amount: 10.5 },
      { mint: MEME, symbol: null, amount: 1000 },
    ]);
    expect(s.activity).toEqual([
      { signature: 'sig1', blockTime: 1700000000, failed: false },
      { signature: 'sig2', blockTime: null, failed: true },
    ]);
  });
  it('totals only what it can price, so it never shows more than the wallet holds', async () => {
    const s = await loadWallet('rpc', ADDR, fakeFetch());
    expect(s.pricedUsd).toBeCloseTo(2.5 * 150 + 10.5);
    expect(s.unpricedTokens).toBe(1);
  });
  it('shows no dollar total when prices fail, instead of guessing', async () => {
    const s = await loadWallet('rpc', ADDR, fakeFetch({ prices: 'fail' }));
    expect(s.pricedUsd).toBeNull();
    expect(valueSnapshot(1, [], {}).pricedUsd).toBeNull();
  });
  it('surfaces RPC errors', async () => {
    await expect(loadWallet('rpc', ADDR, fakeFetch({ rpcError: 'rate limited' }))).rejects.toThrow('rate limited');
  });
  it('validates addresses', () => {
    expect(isValidAddress(ADDR)).toBe(true);
    expect(isValidAddress('0xabc')).toBe(false);
    expect(isValidAddress('not an address')).toBe(false);
  });
});

describe('no code path can move money', () => {
  const files: string[] = [];
  const walk = (d: string) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(f)) files.push(p);
    }
  };
  walk(join(__dirname, '../src'));
  const forbidden = /\b(signTransaction|signAllTransactions|signAndSendTransaction|signMessage|sendTransaction|sendRawTransaction|requestAirdrop)\s*\(/;
  it.each(files)('%s never calls signing or sending methods', (f) => {
    // comments may name these methods; only calls are forbidden
    const code = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    expect(code).not.toMatch(forbidden);
  });
});
