import type { Trade, VenueConfig } from '../../engine';
import { signedPct, signedUsd, simClock, tone } from '../format';

const REASON: Record<Trade['reason'], string> = {
  'take-profit': 'TP',
  'stop-loss': 'SL',
  rug: 'RUG',
  time: 'END',
};

export function TradeTape({ trades, venues }: { trades: Trade[]; venues: VenueConfig[] }) {
  const byId = Object.fromEntries(venues.map((v) => [v.id, v]));
  return (
    <section className="card tape" aria-label="Recent closed trades">
      <h2 className="section-title">Trade tape</h2>
      {trades.length === 0 ? (
        <p className="muted small">No trades yet. Press Start.</p>
      ) : (
        <ol className="tape-list">
          {trades.map((t) => (
            <li key={t.id} className="tape-row">
              <span className="num muted">{simClock(t.simTimeMs)}</span>
              <span className={`tape-venue accent-${byId[t.venueId].accent}`}>{byId[t.venueId].name}</span>
              <span className="tape-ticker">${t.ticker}</span>
              <span className={`tape-reason reason-${t.reason}`}>{REASON[t.reason]}</span>
              <span className={`num tape-pnl ${tone(t.pnl)}`}>
                {signedUsd(t.pnl)} <span className="muted">{signedPct(t.pnlPct, 0)}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
