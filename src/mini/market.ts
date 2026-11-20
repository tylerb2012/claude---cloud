/**
 * Simulated memecoin market for the Discover tab. Every token, price and
 * stat here is made up and moves as a random walk with rug pulls. Riskier
 * tokens (red flags) rug more often, as they tend to in real markets.
 */
import { createRng, type Rng } from '../engine';

export type Chain = 'Solana' | 'Ethereum' | 'Base' | 'BNB';
export const CHAINS: Chain[] = ['Solana', 'Ethereum', 'Base', 'BNB'];

export interface Token {
  id: number;
  symbol: string;
  name: string;
  chain: Chain;
  emoji: string;
  hue: number;
  price: number;
  /** Closes, oldest first; history[0] is the reference for the change %. */
  history: number[];
  supply: number;
  volume: number;
  liquidity: number;
  /** 0 = clean, 1 = every red flag. Drives the rug chance. */
  risk: number;
  flags: string[];
  /** Per-tick volatility. */
  vol: number;
  rugged: boolean;
  /** Ticks since launch. */
  age: number;
}

export interface MarketConfig {
  size: number;
  historyLen: number;
  /** Rug chance per tick for a clean token; a max-risk token rugs `riskMultiplier` times as often. */
  baseRugPerTick: number;
  riskMultiplier: number;
  /** Ticks a rugged token stays listed before a new launch replaces it. */
  delistAfter: number;
}

export const MARKET_CONFIG: MarketConfig = {
  size: 16,
  historyLen: 60,
  baseRugPerTick: 0.0008,
  riskMultiplier: 12,
  delistAfter: 25,
};

const SYL = ['zor', 'mo', 'bli', 'ka', 'pu', 'ni', 'flo', 'gra', 'tu', 'vex', 'lu', 'qui', 'ro', 'ba', 'snu', 'del', 'fi', 'wo', 'ji', 'ty'];
const EMOJI = ['🐸', '🦛', '🐶', '🐱', '🚀', '🌙', '🔥', '🍌', '🦄', '👽', '🐳', '🍄', '💎', '🐉', '🦊', '🐧', '🌶️', '🧃', '🪐', '🐝'];
const FLAGS = ['Mint authority not revoked', 'Top 10 wallets hold over 40%', 'Liquidity not locked', 'Dev wallet sold early', 'Under 1 hour old'];

export interface Market {
  tokens: Token[];
  tick: number;
  nextId: number;
  rng: Rng;
}

function makeToken(m: Market, cfg: MarketConfig, prefill: boolean): Token {
  const r = m.rng;
  const syl = () => SYL[r.int(SYL.length)];
  const base = syl() + syl() + (r.next() < 0.4 ? syl() : '');
  const symbol = base.toUpperCase().slice(0, 6);
  const risk = Math.pow(r.next(), 0.8);
  const flags = FLAGS.filter((_, i) => r.next() < risk * (0.5 + i * 0.1));
  const price = Math.pow(10, r.range(-7, -1));
  const token: Token = {
    id: m.nextId++,
    symbol,
    name: base[0].toUpperCase() + base.slice(1),
    chain: CHAINS[r.int(CHAINS.length)],
    emoji: EMOJI[r.int(EMOJI.length)],
    hue: r.int(360),
    price,
    history: [price],
    supply: Math.round(r.range(1e8, 1e10)),
    volume: 0,
    liquidity: 0,
    risk,
    flags,
    vol: r.range(0.02, 0.07) * (1 + risk),
    rugged: false,
    age: 0,
  };
  token.liquidity = token.price * token.supply * r.range(0.03, 0.15);
  token.volume = token.liquidity * r.range(0.5, 8);
  if (prefill) for (let i = 0; i < cfg.historyLen - 1; i++) step(token, m, cfg);
  return token;
}

function step(t: Token, m: Market, cfg: MarketConfig) {
  const r = m.rng;
  t.age++;
  if (!t.rugged && r.next() < cfg.baseRugPerTick * (1 + (cfg.riskMultiplier - 1) * t.risk)) {
    t.rugged = true;
    t.price *= r.range(0.01, 0.1);
    t.liquidity *= 0.02;
  } else {
    const s = t.rugged ? t.vol * 0.3 : t.vol;
    t.price *= Math.exp(s * r.normal() - (s * s) / 2); // fair random walk: no drift up or down
  }
  t.volume = t.rugged ? t.volume * 0.6 : Math.max(0, t.volume * r.range(0.9, 1.1) + t.liquidity * r.range(0, 0.4));
  if (!t.rugged) t.liquidity *= r.range(0.98, 1.025);
  t.history.push(t.price);
  if (t.history.length > cfg.historyLen) t.history.shift();
}

export function createMarket(seed: number, cfg: MarketConfig = MARKET_CONFIG): Market {
  const m: Market = { tokens: [], tick: 0, nextId: 1, rng: createRng(seed) };
  for (let i = 0; i < cfg.size; i++) m.tokens.push(makeToken(m, cfg, true));
  return m;
}

/** Advances every price one tick. Rugged tokens are delisted after a while and new launches take their place. */
export function tickMarket(m: Market, cfg: MarketConfig = MARKET_CONFIG): void {
  m.tick++;
  for (const t of m.tokens) step(t, m, cfg);
  m.tokens = m.tokens.map((t) => (t.rugged && t.age > cfg.delistAfter && rugAge(t) > cfg.delistAfter ? makeToken(m, cfg, false) : t));
}

function rugAge(t: Token): number {
  // ticks since the big drop: count trailing closes after the largest single-bar fall
  let worst = 0;
  let at = t.history.length - 1;
  for (let i = 1; i < t.history.length; i++) {
    const d = t.history[i] / t.history[i - 1];
    if (d < 1 && 1 - d > worst) {
      worst = 1 - d;
      at = i;
    }
  }
  return t.history.length - 1 - at;
}

export const changePct = (t: Token) => t.price / t.history[0] - 1;
export const marketCap = (t: Token) => t.price * t.supply;
