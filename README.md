# Multi-Venue Trading Dashboard

A mobile-first dashboard showing balances and trades across three venues.

**v1 is simulation only.** Nothing connects to an account, wallet, exchange or price feed, and there is no code that places orders, deposits or withdraws. Every screen carries a **Simulation** badge.

## Setup

```bash
npm install
npm run dev        # open the printed URL, ideally on a phone or in a phone-sized window
npm test           # engine unit tests
npm run batch      # 1,000 simulated sessions (options: --runs 5000 --seed 1)
npm run build      # typecheck + production build into dist/
```

Requires Node 18+.

## Configuration

Every simulation parameter lives in [`src/engine/config.ts`](src/engine/config.ts). The UI, the tests and the batch script all read from it.

| Parameter | Default | Source |
|---|---|---|
| `startingBalance` | $98, split evenly over 3 venues | brief |
| `tradesPerVenuePerSession` | 40 (one session = one simulated day) | brief |
| `positionSizePct` | 6% of the venue's current balance | brief |
| `rugChance` | 8% per trade | brief |
| `pricePathSteps` | 30 | brief |
| `feeRate` | 1%, charged on **each** buy and sale | brief, side **assumed** |
| `takeProfitPct` / `stopLossPct` | +15% / −7% | brief |
| `rugLossMin` / `rugLossMax` | price drops 85–99% | **assumed** |
| `stepVolatility` | 3% per step (log-normal) | **assumed** |
| `stepDrift` | 0 (fair random walk, no edge) | **assumed** |
| `realSecondsPerSessionAt1x` | 90 s per simulated day at 1× | **assumed** |
| `seed` | `null` (random per session) | |

> The brief points to `paper-bot-simulator-spec.md` for the exact rules. That file was not available when v1 was built, so the values marked **assumed** need checking against it.

**Reproducible runs:** set `seed` in the config, set `VITE_SIM_SEED` in `.env`, or open the app with `?seed=123`. The footer shows the current seed. The same seed gives the same trades at any playback speed.

## How the simulation works

- At session start, each venue gets 40 trade times spread at random across a 24-hour day.
- Each trade stakes 6% of that venue's balance and draws a 30-step price path. With 8% probability the token is rugged at a random step.
- The trade exits on the first step that hits take-profit or stop-loss. If neither hits, it exits at step 30. **Fills are at that step's price, not at the threshold**, so a rug gaps straight through the stop-loss.
- The fee comes off the stake on entry and off the sale value on exit. A trade can lose at most its stake, so balances can't go negative.
- The take-profit/stop-loss toggles apply to trades from that moment on.
- The "sessions ended below start" count is stored in your browser only (localStorage).

## Things in the numbers you should know

These are true of the model, not bugs, but they're easy to misread:

1. **The stop-loss does not cap losses at −7%.** Stop-loss trades on the tape usually show −9% to −12%. Prices move in discrete steps, so the fill lands past the threshold, and about 2% of fees come on top. Rugs that gap through the stop lose 85% or more.
2. **Take-profit wins show about +13% to +16%, not +15%**, for the same reasons in the other direction.
3. **The default settings lose money.** A sample batch run (2,000 sessions): average final balance **$86.06 (−12.2%)**, 99.95% of sessions end below $98, trade win rate 33%. About $4.32 of each session's loss is fees. The rest is rugs and stop-loss slippage. A win rate near 33% with only small wins is what this rule set produces.
4. A session can look profitable mid-day. Single sessions are noisy, so use `npm run batch` to judge the rules.

## Project layout

```
src/engine/       pure TypeScript trading engine, no DOM (unit-tested)
  config.ts       all parameters
  rng.ts          seeded PRNG (mulberry32)
  trade.ts        price paths, exit rules, fee/P&L settlement
  session.ts      one simulated day across all venues
src/ui/           React UI (useSimulation hook drives the engine)
scripts/batch.ts  Monte Carlo check over many sessions
tests/            vitest tests: P&L, fees, TP/SL, rugs, non-negative balance, determinism
```

## Simulated vs. real

| | v1 Simulation (built) | v2 Paper + live prices | v3 Read-only live data |
|---|---|---|---|
| Prices | random, generated locally | public market API | n/a |
| Trades | simulated | simulated on real prices | your real history |
| Balances | simulated | simulated | your real accounts |
| Orders placed | never | never | never |
| Badge | Simulation | Paper, live prices | Live data |

## Secrets

v1 uses no keys. `.env` is git-ignored. Only `.env.example` is committed. For v2/v3, keys go into a small local backend, never into `VITE_*` variables (those get bundled into the browser). v3 will document how to create **read-only** keys with withdrawal and trading permission switched off.
