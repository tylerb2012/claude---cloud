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
- Every agent is a working bot with its own rule, settings and scoreboard (tap it on the page). Wallet Monitor filters small transfers, Macro Scout skips risk-on shorts when the VIX is low, Liq Mapper moves take-profit 2 to the long-liquidation cluster, Funding Watch flags crowding, Squeeze Gate and News Filter block, Sizer halves size when a warning slips through, Executor can miss a post-only fill, TP Manager and Stop Guard run the exits, Scribe logs.
- When a gate blocks a signal, the trade is played out on paper on its own random path so the bot's page can show what blocking saved or cost. Every trade loses on average with zero edge, so blocking anything looks like a save. The useful comparison is blocked trades against trades that went through.
- The gates can only help because the simulator assumes risk-on markets drift up, crowded shorts get squeezed and headlines cause jumps.
- Paper only: no exchange connection, no keys, no orders.

## Real-data test (`forward/`)

`npm run forward` tests the wallet-monitor signal on real data, on paper:

1. Downloads Whale Alert's free historical alert archive (about 40 MB) and keeps transfers from a non-exchange wallet into an exchange, worth $1M+, in coins with a Hyperliquid perp (stablecoins excluded).
2. Opens a paper short at the first 15-minute candle after each alert and runs the desk's exit rules (two-step take-profit, stop, trail, 60-minute limit, fees) on Hyperliquid's real candles.
3. Runs the same rules at random times on the same coins as a control group.
4. Writes `public/forward/results.json` (shown on the desk's Real-data test panel) and `forward/REPORT.md`.

Options: `--days 50` (15m candles reach back about 52 days), `--interval 1h --days 200` for a longer window, `--archive file.json.gz` to use a downloaded archive. Node's fetch needs `NODE_USE_ENV_PROXY=1` behind a proxy.

**Results so far (Nov 2026):** whale-alert shorts did worse than random shorts in both windows. Over 50 days on 15m candles: −$1.08 vs −$0.11 per $100-margin trade (205 alerts, t = −2.7). Over 200 days on 1h candles: −$0.90 vs −$0.32 (771 alerts, t = −3.3). Prices tended to rise slightly after big transfers to exchanges. Alerts come in bursts, so the t-statistics overstate certainty, but there is no sign of the edge the strategy needs.

The desk is served at `/desk.html` on the deployed site (built into `public/` by `npm run build:desk`). There its wallet panel can connect Phantom read-only or watch an address; inside the claude.ai page, outside connections are blocked.

## Strategy lab

The desk's **Strategy lab** panel replays a technique you configure on every real whale alert (Whale Alert's free archive) using Hyperliquid's real hourly candles, on paper:

- Sliders and switches: short or long after the alert, leverage, stop, take-profit 1 (half) and 2 (rest), trailing stop and its distance, maximum hold (1–48h), minimum transfer size, which coins, which exchanges the money went to.
- Each run compares the alert trades with random entries on the same coins and periods (5 per alert).
- The last 50 days are held back. A setting shows **PASS** only with a positive average and t ≥ 2 against random in both the older data and the held-back days (at least 30 and 15 trades).
- `desk/lab.js` is the pure lab engine (tests: `tests/lab.test.ts`, including one that checks the lab detects a planted edge). `npm run lab-data` rebuilds `public/forward/lab-data.json` (about 1.7 MB: 200 days of alerts and hourly candles).
- Limits: hourly candles make stop/take-profit order within a bar approximate (the adverse side is checked first), funding isn't included, and entries assume a fill at the next hourly open after the alert.

In a 48-setting sweep (Nov 2026), none passed. The best-looking settings on the older data, mostly longs held 1–24 hours, lost money on the held-back days.

## Underdog Bot (Polymarket BTC 5-minute paper trader)

A paper copy of a bot shared on X: on Polymarket's "Bitcoin Up or Down" 5-minute markets it buys whichever side is cheaper (the one the market thinks is less likely), only when that side costs 20–35¢, and holds to settlement ($1 a share or $0). One entry per market. It reads Polymarket's public APIs (`gamma-api.polymarket.com`, `clob.polymarket.com`, no key) and **places no orders**.

| Command | What it does |
|---|---|
| `npm run poly` | Live paper trading in the terminal: watches every 5-minute market, buys from the real order book, settles when Polymarket posts the result. Keeps the account in `poly/data/ledger.json` between runs. Options: `--stake 500 --min 0.2 --max 0.35 --balance 10000 --reset` |
| `npm run poly:backtest` | Replays the rule on the last N hours of settled markets (`--hours 168`) and prints hit rate by entry price, next to a control that buys the underdog in every market at any price. |
| `npm run build:poly` | Builds `public/poly.html`, the same bot as a phone page (served at `/poly.html`). It trades only while the page is open and saves the account in that browser. |

Behind this sandbox's proxy, Node's fetch needs `NODE_USE_ENV_PROXY=1`; on a normal computer it doesn't.

- `poly/engine.js`: the rule, order-book fills, fees, the paper ledger and the stats (tests: `tests/poly.test.ts`). `poly/api.js`: Polymarket reads. Settings and their defaults are at the top of `engine.js`.
- **Break-even:** you need to win as often as the price you pay per share, fees included (about 27% at the band's average entry).
- **Fees (assumed):** these markets charge a taker fee. The default is `shares × p × 0.25 × (p(1−p))²`, about 1–1.5% of the stake in this band. The docs couldn't be checked from here, so confirm it on docs.polymarket.com and change `feeRate`/`feeExponent` if needed.
- **Backtest limits:** it uses the last traded price about once a minute plus 1¢ to stand in for the ask, takes Down as 1 − Up, and ignores book depth. The live runner and the page fill from the real order book.

**Results so far (Nov 2026):** the rule as described loses money. Over the last 7 days (2,016 markets, 1,245 trades, $500 each) it won 25.9% of the time against 27.2% needed to break even, for **−9.4% per dollar staked** (−$58.6K; max drawdown $77K; 19 losses in a row at worst). The 20–30¢ entries lost; only 30–35¢ entries were slightly positive. The control (buy the underdog in every market) shows the market's prices are about right or slightly too high for the underdog at every price level. Over 48 hours it came out at −1.2%, which shows how noisy a few hundred trades are. The bot in the screenshot made $103K on $13.1M of volume (0.8%), and its profile lists only winning trades; its edge, if real, probably comes from things this rule doesn't copy, such as when it buys, using resting limit orders (which pay no taker fee) or reading the live BTC price faster than the market.
