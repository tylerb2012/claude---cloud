export const usd = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const signedUsd = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '') + usd(Math.abs(n));

export const signedPct = (n: number, digits = 1) =>
  (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n * 100).toFixed(digits) + '%';

export const tone = (n: number) => (n > 0.005 ? 'up' : n < -0.005 ? 'down' : 'flat');

export function simClock(ms: number): string {
  const totalMin = Math.floor(ms / 60000);
  const h = Math.min(24, Math.floor(totalMin / 60));
  const m = totalMin % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Whole dollars once the amount is $10 or more, as in the compact venue stats. */
export const signedUsdShort = (n: number) =>
  Math.abs(n) >= 10 ? (n > 0 ? '+' : '−') + '$' + Math.round(Math.abs(n)).toLocaleString('en-US') : signedUsd(n);

export function elapsed(ms: number): string {
  const m = Math.floor(ms / 60000);
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}
