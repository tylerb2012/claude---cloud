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
3. **The default settings lose money.** A 1,000-day batch run with chart rules on (the default): average final balance **$97.29 (−0.7%)**, 78% of days end below $98, trade win rate 31%, about 8 trades a day. With chart rules off (buying every slot, 120 trades a day): average **$85.97 (−12.3%)** and almost every day ends below $98.
4. **Chart rules lose less only because they trade less.** Every technique loses money on every trade. The RSI dip loses the least per trade because it holds for the shortest time (about 7 bars against 14), so fewer of its trades are still open when a rug hits. Leave out rugged trades and every technique, including buying blind, loses about the 2% round-trip fee.
5. A day can look profitable halfway through. Single days are noisy, so use `npm run batch` to judge the rules.

## Chart techniques

Each agent reads the chart with one standard technique before it buys, and keeps watching it to decide when to sell. The agent sees 40 bars of history before each possible entry.

| Technique | Agents | Buys when | Sells when |
|---|---|---|---|
| Breakout | Scout, Sniper, Smarts | price closes above the highest close of the last 20 bars (breaks resistance) | price closes below the lowest close of the last 10 bars (trailing support) |
| EMA cross | Pairs, Curve, Trend | the 9-bar EMA crossed above the 21-bar EMA in the last 3 bars and price is above the 21 EMA | the 9 EMA falls back below the 21 EMA |
| RSI dip | Exec, Exit, Router | RSI(14) is under 35 (oversold) and the last bar closed up | RSI climbs above 55, or price gets back to the 20-bar average |

- Take-profit and stop-loss still apply on top, as hard limits.
- With chart rules on, an agent stays out when its technique gives no signal. The venue card counts these as "passed". Each slot is now a look at the chart, so a day has about 8 trades instead of 120. To get more trades, raise `tradesPerVenuePerSession` in `config.ts`.
- The **Chart rules** chip switches every agent to buying blind, so you can compare.
- **Tap any trade on the tape** to see the chart the agent read: price, the indicators its technique uses, the entry and exit points, RSI underneath, and plain-language reasons for the buy and the sell.
- The indicators are in `src/engine/indicators.ts`, and the strategies in `src/engine/strategies.ts`. Tests check that no indicator ever uses future bars.
- `npm run batch` prints each technique's results per trade next to buying blind.

### Graduation hunters (Launchpad)

The Launchpad agents hunt graduating coins, so they use their own exit plan (`exits` on the venue in `config.ts`):

- take-profit at **+100%** instead of +15%
- trades stay open up to **120 bars** instead of 30
- no chart sell signals: they exit only at the take-profit, the stop-loss, or the end of the window

A 2,000-day comparison of Launchpad trades:

| Exit plan | Hit +100% | Stopped out | Rugged | Avg per trade | Launchpad end of day (start $32.67) |
|---|---|---|---|---|---|
| Old: TP +15%, 30 bars | (TP +15%: 18.8%) | 34.1% | 2.6% | −4.5% | $32.42 |
| **New: TP +100%, 120 bars, SL −7%** | **1.6%** | 80.9% | 2.6% | −4.9% | $32.41 |
| New with SL −25% | 2.0% | 38.9% | 6.3% | −8.2% | $32.23 |
| New with no stop-loss | 2.0% | 0% | 8.2% | −9.4% | $32.17 |

About 1 trade in 60 reaches +100%. Most get stopped out first. Wider stops let trades run longer, but then more of them are still open when a rug hits, so they lose more. The −7% stop is the least bad, so it stays.

**Why they can't win here:** the simulator's prices are a random walk, so a chart pattern says nothing about the next bar. These techniques only matter on real price charts, which is what v2 (paper trading on live prices) is for. On real data the batch comparison becomes a real test for an edge.

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

| | v1 Simulation (built) | v2 Paper + live prices | v3 Read-only live data (built, Solana/Phantom) |
|---|---|---|---|
| Prices | random, generated locally | public market API | n/a |
| Trades | simulated | simulated on real prices | your real history |
| Balances | simulated | simulated | your real accounts |
| Orders placed | never | never | never |
| Badge | Simulation | Paper, live prices | Live data |

## Live data mode (read-only wallet)

The switch at the bottom of the screen moves between **Simulation** and **Live data**. The simulation keeps its state while you're on the other screen.

**Live data** shows your real Solana wallet:

- **Connect Phantom.** In a browser that has the Phantom extension, or inside the Phantom app's own browser (on a phone, the "Open in the Phantom app" button reopens the page there). Connecting gives the app your **public address only**.
- **Or watch an address.** Paste any public Solana address. No wallet needed.
- **What it shows.** SOL and token balances, a dollar total and the last 10 transactions, linked to Solscan. It refreshes every 60 seconds.
- **Where the numbers come from.** Balances come from a Solana RPC node (`VITE_SOLANA_RPC_URL`, default: the public mainnet endpoint, which is rate-limited). Prices for SOL, USDC and USDT come from CoinGecko.
- **The total never overstates.** Tokens without a price are listed but left out of the dollar total, and the screen says so. If prices fail to load, no dollar total is shown at all.

**Add funds** never touches money. It explains how to buy with Apple Pay inside the Phantom app (Phantom's licensed partners handle payment and identity checks), and shows your address for sending from an exchange. If you sign up with an on-ramp provider, set `VITE_ONRAMP_URL_TEMPLATE` (with `{address}`) and a "Continue to …" button appears.

**Guarantees:**

- The app never calls any signing or sending method. `tests/live.test.ts` scans every source file and fails if one appears.
- The bots only ever trade in Simulation.
- The connected address is saved in your browser so it reconnects next time. Disconnect clears it.

> I couldn't reach Solana or CoinGecko from the build environment (its network policy blocks them), so the live-data code is tested against the documented response formats with mocked network calls. Try it with your own address on your phone and tell me if anything looks off.

## Secrets

v1 uses no keys. `.env` is git-ignored. Only `.env.example` is committed. For v2/v3, keys go into a small local backend, never into `VITE_*` variables (those get bundled into the browser). v3 will document how to create **read-only** keys with withdrawal and trading permission switched off.

## Layout

The UI follows the reference layout you shared: a compact header with a clock, the hero balance with P&L, a multiplier chip and a chart panel, the allocation bar, venue cards with three color-coded agent tiles each, toasts for big trades, a venue-tagged trade tape and a 24h recap sheet when the session ends. It differs from the reference in a few places, on purpose:

- **No real brands.** Venue names, icons and the app name are generic and set in `config.ts`. When v3 connects your own accounts, rename the venues to match them.
- **No deposit or "pay with card" step.** v1 has no money movement (ground rule 2).
- **"Simulation" badge instead of "venues live".** Nothing is live.
- **Agent percentages are each agent's simulated win rate**, not a confidence score. The bar under each agent shows the same number.
- **The chart scales every line to its own start**, so 1× (dashed) is break-even for the total (bold) and for each venue (thin, colored).
- **The tape shows closed trades with how they exited** (TP / SL / RUG / END), not separate BUY rows, because the engine records each trade once, when it closes.

## Paper mini app

`mini.html` (`npm run dev`, then open `/mini.html`) is a phone-first, four-tab version built for fun. It runs on play money only:

- **Discover:** a simulated memecoin market. Prices tick every 1.2 seconds as a fair random walk with rug pulls. Tokens with more red flags (mint not revoked, top wallets holding too much, unlocked liquidity…) rug more often. Tap a token for its chart, stats and red flags, then paper-buy $5, $10, $25 or Max.
- **Bot:** pick a strategy (Momentum, Breakout, Dip buyer, Runner, New pairs) and a risk level (Conservative 3% / Balanced 6% / Aggressive 12% per trade), then run the venue simulator. Changing either starts a fresh session.
- **Wallet:** paper cash and holdings, with live value and P&L. Rugged holdings shake. You can sell everything, top up with $100 of play money, or reset.
- **Profile:** streak, stats and badges (first profit, survived a rug, +100% club…), plus a short guide to spotting scam trading bots.

It has no wallet connection, no deposit addresses, no keys and no invites. Tests check that every strategy and risk combination still loses money on average (`tests/mini.test.ts`). `npm run build:paper` builds it as one shareable page.

### In Telegram

The mini app also runs as a Telegram Mini App. It loads Telegram's SDK in `mini.html` (`src/mini/telegram.ts`) to follow Telegram's theme, use its back button, send haptic taps, and show the user's first name. Outside Telegram these calls do nothing. Setup steps (Vercel and BotFather, all doable from a phone) are in [TELEGRAM.md](TELEGRAM.md).

## Venue Desk (paper trading desk)

`desk/` is a single-page "AI trading desk": eleven agents (Wallet Monitor, Macro Scout, Liq Mapper, Funding Watch, Squeeze Gate, News Filter, Sizer, Executor, TP Manager, Stop Guard, Scribe) pass each signal down a pipeline. Signals that get through open a leveraged short on a simulated perpetual future. It has a live candlestick chart with entry, take-profit, stop and liquidation lines, an order book, the wallet-monitor feed, a fills log, and a reality check that runs 1,000 sessions.

- `desk/engine.js`: the engine (no DOM). Tests are in `tests/desk.test.ts`.
- `desk/ui.html`: the page. `npm run build:desk` inlines the engine into one file in `dist-desk/`.
- **Assumed signal edge** defaults to 0, because nobody has shown the wallet-monitor signal predicts anything. With 0 edge every setting loses money on average; in the default setup 72% of 1,000 sessions end below the start. Break-even needs roughly 0.02% of favorable drift per bar.
- The gates help only because the simulator assumes crowded shorts and headline risk cause more upward gaps.
- Paper only: no exchange connection, no keys, no orders.
