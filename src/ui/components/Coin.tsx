const COLORS = ['#f97316', '#8b5cf6', '#ec4899', '#14b8a6', '#3b82f6', '#eab308', '#ef4444', '#22c55e'];

/** Small coloured circle with the ticker's first letter. */
export function Coin({ ticker }: { ticker: string }) {
  let h = 0;
  for (const c of ticker) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return <span className="coin" style={{ background: COLORS[h % COLORS.length] }} aria-hidden="true">{ticker[0]}</span>;
}
