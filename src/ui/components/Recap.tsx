import type { SimSession, VenueConfig } from '../../engine';
import { signedPct, tone, usd } from '../format';
import type { SessionStats } from '../useSimulation';

interface Props {
  session: SimSession;
  venues: VenueConfig[];
  stats: SessionStats;
  onAgain: () => void;
  onClose: () => void;
  onClearStats: () => void;
}

export function Recap({ session: s, venues, stats, onAgain, onClose, onClearStats }: Props) {
  const total = s.total;
  const change = total / s.startingBalance - 1;
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <section className="sheet" role="dialog" aria-modal="true" aria-label="Session recap" onClick={(e) => e.stopPropagation()}>
        <span className="sheet-handle" aria-hidden="true" />
        <header className="recap-head">
          <span className="logo-tile" aria-hidden="true">◆</span>
          <div>
            <h2>24h recap</h2>
            <span className="mono tiny muted">{venues.map((v) => v.name.toLowerCase()).join(' · ')}</span>
          </div>
          <span className="badge badge-sim">Simulation</span>
        </header>
        <div className="recap-in mono">
          <span className="muted">put in</span>
          <span>{usd(s.startingBalance)}</span>
        </div>
        <div className="recap-out">
          <span className={`recap-final mono ${tone(total - s.startingBalance)}`}>{usd(total)}</span>
          <span className="chip mono">{(total / s.startingBalance).toFixed(2)}×</span>
        </div>
        <p className={`mono tiny ${tone(change)}`}>{signedPct(change, 2)} over the session</p>
        <ul className="recap-venues">
          {s.venues.map((v, i) => (
            <li key={v.id} className={`recap-venue accent-${venues[i].accent}`}>
              <span className="venue-icon" aria-hidden="true">{venues[i].icon}</span>
              <div className="venue-title">
                <span className="venue-name-plain">{venues[i].name}</span>
                <span className="mono tiny muted">{v.trades} trades · {v.wins} won</span>
              </div>
              <div className="venue-money">
                <span className={`mono ${tone(v.balance - v.startBalance)}`}>{usd(v.balance)}</span>
                <span className="mono tiny muted">from {usd(v.startBalance)}</span>
              </div>
            </li>
          ))}
        </ul>
        <p className="mono tiny muted">
          {s.tradeCount} trades · {s.venues.reduce((n, v) => n + v.agents.length, 0)} agents ·{' '}
          {s.tradeCount ? Math.round((s.wins / s.tradeCount) * 100) : 0}% win
        </p>
        <p className="recap-count tiny">
          <strong className="mono">{stats.belowStart}</strong> of <strong className="mono">{stats.completed}</strong> completed
          sessions on this device ended below the {usd(s.startingBalance)} start.{' '}
          <button className="linkish" onClick={onClearStats}>Clear</button>
        </p>
        <button className="btn sheet-cta" onClick={onAgain}>Run another simulated session</button>
      </section>
    </div>
  );
}
