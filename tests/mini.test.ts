import { describe, expect, it } from 'vitest';
import { makeConfig, SimSession } from '../src/engine';
import { makeBotConfig } from '../src/mini/botConfig';
import { changePct, createMarket, MARKET_CONFIG, tickMarket } from '../src/mini/market';
import { buy, newWallet, PAPER_FEE, positionValue, sell } from '../src/mini/wallet';

describe('paper wallet', () => {
  it('charges 1% to buy and 1% to sell, so a flat round trip loses about 2%', () => {
    let w = buy(newWallet(100), 1, 'ABC', 0.5, 50);
    expect(w.cash).toBeCloseTo(50);
    expect(positionValue(w.positions[0], 0.5)).toBeCloseTo(50 * (1 - PAPER_FEE) ** 2);
    const r = sell(w, 1, 0.5, false);
    w = r.wallet;
    expect(r.trade!.pnlPct).toBeCloseTo((1 - PAPER_FEE) ** 2 - 1);
    expect(w.positions).toHaveLength(0);
    expect(w.history).toHaveLength(1);
  });
  it('never spends more than the cash it has, and a rug can at worst zero a position', () => {
    let w = buy(newWallet(10), 1, 'ABC', 1, 500);
    expect(w.cash).toBe(0);
    w = sell(w, 1, 0, true).wallet;
    expect(w.cash).toBe(0);
    expect(w.history[0].pnl).toBeCloseTo(-10);
  });
  it('adds to an existing position', () => {
    let w = buy(newWallet(100), 1, 'ABC', 1, 10);
    w = buy(w, 1, 'ABC', 2, 10);
    expect(w.positions).toHaveLength(1);
    expect(w.positions[0].cost).toBeCloseTo(20);
  });
});

describe('simulated market', () => {
  it('is reproducible from a seed', () => {
    const a = createMarket(7);
    const b = createMarket(7);
    for (let i = 0; i < 50; i++) {
      tickMarket(a);
      tickMarket(b);
    }
    expect(a.tokens.map((t) => t.price)).toEqual(b.tokens.map((t) => t.price));
  });
  it('keeps the listing full, replacing rugged tokens with new launches', () => {
    const m = createMarket(3, { ...MARKET_CONFIG, baseRugPerTick: 0.05 });
    for (let i = 0; i < 300; i++) tickMarket(m, { ...MARKET_CONFIG, baseRugPerTick: 0.05 });
    expect(m.tokens).toHaveLength(MARKET_CONFIG.size);
    expect(m.nextId).toBeGreaterThan(MARKET_CONFIG.size + 1);
  });
  it('risky tokens rug more often than clean ones', () => {
    let risky = 0, riskyRug = 0, clean = 0, cleanRug = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const m = createMarket(seed);
      const start = new Map(m.tokens.map((t) => [t.id, t]));
      for (let i = 0; i < 200; i++) tickMarket(m);
      for (const t of start.values()) {
        if (t.risk > 0.6) { risky++; if (t.rugged) riskyRug++; }
        if (t.risk < 0.3) { clean++; if (t.rugged) cleanRug++; }
      }
    }
    expect(riskyRug / risky).toBeGreaterThan(cleanRug / clean);
  });
  it('has no upward drift: the average token does not go up', () => {
    let sum = 0, n = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const m = createMarket(seed);
      for (let i = 0; i < 60; i++) tickMarket(m);
      for (const t of m.tokens) { sum += changePct(t); n++; }
    }
    expect(sum / n).toBeLessThan(0.15);
  });
});

describe('bot strategy and risk', () => {
  it('different picks change the results', () => {
    const run = (cfg: ReturnType<typeof makeConfig>) => { const s = new SimSession(cfg, 9); s.runToEnd(); return s.total; };
    const results = new Set([
      run(makeBotConfig('momentum', 'balanced')),
      run(makeBotConfig('dip', 'balanced')),
      run(makeBotConfig('newpairs', 'aggressive')),
    ]);
    expect(results.size).toBe(3);
  });
  it('aggressive stakes more per trade than conservative', () => {
    expect(makeBotConfig('breakout', 'aggressive').positionSizePct).toBeGreaterThan(makeBotConfig('breakout', 'conservative').positionSizePct);
  });
  it('every strategy and risk still loses money on average', () => {
    for (const strat of ['momentum', 'breakout', 'dip', 'runner', 'newpairs'] as const) {
      for (const risk of ['conservative', 'aggressive'] as const) {
        let sum = 0;
        for (let seed = 1; seed <= 150; seed++) {
          const s = new SimSession(makeBotConfig(strat, risk), seed);
          s.runToEnd();
          sum += s.total;
        }
        expect(sum / 150, `${strat}/${risk}`).toBeLessThan(98);
      }
    }
  });
});
