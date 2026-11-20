import type { VenueConfig, VenueState } from '../../engine';
import { signedUsd, tone, usd } from '../format';

interface Props {
  venue: VenueConfig;
  state: VenueState;
}

export function VenueCard({ venue, state }: Props) {
  const pnl = state.balance - state.startBalance;
  return (
    <article className={`card venue accent-${venue.accent}`} aria-label={`${venue.name} venue`}>
      {/* keyed on the last trade id so the flash restarts on every trade */}
      {state.lastTradeId !== null && <span key={state.lastTradeId} className="flash" aria-hidden="true" />}
      <header className="venue-head">
        <span className="venue-icon" aria-hidden="true">{venue.icon}</span>
        <span className="venue-name">{venue.name}</span>
        <span className="venue-trades">{state.trades} trades</span>
      </header>
      <div className="venue-nums">
        <span className="venue-balance num">{usd(state.balance)}</span>
        <span className={`num ${tone(pnl)}`}>{signedUsd(pnl)}</span>
      </div>
      {state.skipped > 0 && (
        <p className="venue-warn">{state.skipped} trades skipped: balance too small to trade.</p>
      )}
      <ul className="agents">
        {state.agents.map((a) => {
          const active = a.lastTradeId !== null && a.lastTradeId === state.lastTradeId;
          return (
            <li key={a.name} className={`agent ${active ? 'active' : ''}`}>
              {active && <span key={a.lastTradeId} className="agent-flash" aria-hidden="true" />}
              <span className="agent-name">{a.name}</span>
              <span className={`agent-pnl num ${tone(a.pnl)}`}>{signedUsd(a.pnl)}</span>
              <span className="agent-count num">{a.trades}×</span>
            </li>
          );
        })}
      </ul>
    </article>
  );
}
