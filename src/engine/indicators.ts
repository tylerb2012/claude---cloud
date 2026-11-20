/**
 * Classic chart indicators over a series of closing prices. Each output array
 * lines up with the input: value[i] uses only closes up to and including i,
 * so nothing looks into the future. NaN means "not enough history yet".
 */

export function ema(close: number[], n: number): number[] {
  const k = 2 / (n + 1);
  const out: number[] = [];
  let prev = NaN;
  for (let i = 0; i < close.length; i++) {
    if (i === n - 1) prev = close.slice(0, n).reduce((a, b) => a + b, 0) / n; // seed with the SMA
    else if (i >= n) prev = close[i] * k + prev * (1 - k);
    out.push(i >= n - 1 ? prev : NaN);
  }
  return out;
}

export function sma(close: number[], n: number): number[] {
  const out: number[] = [];
  let sum = 0;
  for (let i = 0; i < close.length; i++) {
    sum += close[i];
    if (i >= n) sum -= close[i - n];
    out.push(i >= n - 1 ? sum / n : NaN);
  }
  return out;
}

/** Wilder's RSI. 0-100: under 30 is "oversold", over 70 "overbought". */
export function rsi(close: number[], n: number): number[] {
  const out: number[] = [NaN];
  let gain = 0;
  let loss = 0;
  for (let i = 1; i < close.length; i++) {
    const d = close[i] - close[i - 1];
    const g = Math.max(d, 0);
    const l = Math.max(-d, 0);
    if (i <= n) {
      gain += g / n;
      loss += l / n;
    } else {
      gain = (gain * (n - 1) + g) / n;
      loss = (loss * (n - 1) + l) / n;
    }
    out.push(i < n ? NaN : loss === 0 ? 100 : 100 - 100 / (1 + gain / loss));
  }
  return out;
}

/** Highest close of the previous n bars, not counting bar i (resistance). */
export function priorHigh(close: number[], n: number): number[] {
  return close.map((_, i) => (i < n ? NaN : Math.max(...close.slice(i - n, i))));
}

/** Lowest close of the previous n bars, not counting bar i (support). */
export function priorLow(close: number[], n: number): number[] {
  return close.map((_, i) => (i < n ? NaN : Math.min(...close.slice(i - n, i))));
}

export interface Indicators {
  close: number[];
  ema9: number[];
  ema21: number[];
  sma20: number[];
  rsi14: number[];
  high20: number[];
  low10: number[];
}

export function computeIndicators(close: number[]): Indicators {
  return {
    close,
    ema9: ema(close, 9),
    ema21: ema(close, 21),
    sma20: sma(close, 20),
    rsi14: rsi(close, 14),
    high20: priorHigh(close, 20),
    low10: priorLow(close, 10),
  };
}
