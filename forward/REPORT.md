# Real-data test: whale transfers to exchanges

Generated 2026-11-22T22:15:25.380Z · archive up to 2026-11-17T20:26:33.000Z · last 50 days · 15m Hyperliquid candles · paper only

Rules: short at the next candle after the alert, 10x, $100 margin, TP1 −1.0% (half), TP2 −2.2%, stop +0.9%, trailing after TP1, 60-minute limit, maker/taker fees.

| | Whale-alert shorts | Random-time shorts (control) |
|---|---|---|
| Trades | 205 | 1025 |
| Avg P&L per trade | $-1.08 | $-0.11 |
| Avg return on margin | −1.08% ± 0.33% | −0.11% ± 0.14% |
| Win rate | 36% | 44% |
| Price move 1h after (short's view) | −0.062% | +0.039% |
| Price move 4h after (short's view) | −0.039% | +0.117% |
| Total P&L | $-222.30 | (scaled) $-22.59 |

Difference vs control, t-statistic: return on margin -2.69, 1h move -2.30, 4h move -2.18 (about ±2 or beyond would be notable).

**Verdict:** Whale-alert shorts did worse than random shorts.
