/** Paper wallet: play money only. Buying and selling charge a fee on each side. */

export interface Position {
  tokenId: number;
  symbol: string;
  units: number;
  /** Dollars spent, including the buy fee. */
  cost: number;
  entryPrice: number;
  openedAt: number;
}

export interface ClosedTrade {
  symbol: string;
  cost: number;
  proceeds: number;
  pnl: number;
  pnlPct: number;
  rugged: boolean;
  closedAt: number;
}

export interface PaperWallet {
  cash: number;
  start: number;
  positions: Position[];
  history: ClosedTrade[];
}

export const PAPER_FEE = 0.01;

export function newWallet(start = 98): PaperWallet {
  return { cash: start, start, positions: [], history: [] };
}

export function buy(w: PaperWallet, tokenId: number, symbol: string, price: number, usd: number, now = Date.now()): PaperWallet {
  const spend = Math.min(usd, w.cash);
  if (spend <= 0 || price <= 0) return w;
  const units = (spend * (1 - PAPER_FEE)) / price;
  const existing = w.positions.find((p) => p.tokenId === tokenId);
  const positions = existing
    ? w.positions.map((p) =>
        p === existing
          ? { ...p, units: p.units + units, cost: p.cost + spend, entryPrice: (p.cost + spend) / ((p.units + units) / (1 - PAPER_FEE)) }
          : p,
      )
    : [...w.positions, { tokenId, symbol, units, cost: spend, entryPrice: price, openedAt: now }];
  return { ...w, cash: w.cash - spend, positions };
}

export function sell(w: PaperWallet, tokenId: number, price: number, rugged: boolean, now = Date.now()): { wallet: PaperWallet; trade: ClosedTrade | null } {
  const p = w.positions.find((x) => x.tokenId === tokenId);
  if (!p) return { wallet: w, trade: null };
  const proceeds = Math.max(0, p.units * price * (1 - PAPER_FEE));
  const trade: ClosedTrade = {
    symbol: p.symbol, cost: p.cost, proceeds, pnl: proceeds - p.cost, pnlPct: proceeds / p.cost - 1, rugged, closedAt: now,
  };
  return {
    wallet: { ...w, cash: w.cash + proceeds, positions: w.positions.filter((x) => x !== p), history: [trade, ...w.history].slice(0, 100) },
    trade,
  };
}

export function positionValue(p: Position, price: number): number {
  return p.units * price * (1 - PAPER_FEE);
}
