import type { Trade, VenueConfig } from '../../engine';
import { signedUsd, simClock, tone } from '../format';
import { Coin } from './Coin';

const REASON: Record<Trade['reason'], string> = { 'take-profit': 'TP', 'stop-loss': 'SL', rug: 'RUG', time: 'END' };

export function TradeTape({ trades, venues, total, agentCount }: { trades: Trade[]; venues: VenueConfig[]; total: number; agentCount: number }) {
  const byId = Object.fromEntries(venues.map((v) => [v.id, v]));
  return (
    <section className="card tape" aria-label="Recent closed trades">
      <div className="tape-head">
        <h2 className="section-title">multi-venue tape · {agentCount} agents</h2>
        <span className="mono tiny accent-text">{total} closed</span>
      </div>
      {trades.length === 0 ? (
        <p className="muted tiny mono">no trades yet · press start</p>
      ) : (
        <ol className="tape-list">
          {trades.map((t) => (
            <li key={t.id} className="tape-row mono">
              <span className="muted">{simClock(t.simTimeMs)}</span>
              <span className={`tag accent-${byId[t.venueId].accent}`}>{byId[t.venueId].name}</span>
              <span className={`reason reason-${t.reason}`}>{REASON[t.reason]}</span>
              <span className="tape-coin"><Coin ticker={t.ticker} />${t.ticker}</span>
              <span className={`tape-pnl ${tone(t.pnl)}`}>{signedUsd(t.pnl)}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
