import { STRATEGIES, type Trade, type VenueConfig, type VenueState } from '../../engine';
import { signedUsd, signedUsdShort, simClock, tone, usd } from '../format';
import { Coin } from './Coin';

const REASON_VERB: Record<Trade['reason'], string> = { 'take-profit': 'TP', 'stop-loss': 'SL', rug: 'rugged', signal: 'sig', time: 'closed' };

interface Props {
  venue: VenueConfig;
  state: VenueState;
  lastTrade: Trade | undefined;
  agentLastTrade: (Trade | undefined)[];
  /** id of the most recent trade across all venues, to light up the active card */
  latestTradeId: number | null;
  chartRules: boolean;
}

export function VenueCard({ venue, state, lastTrade, agentLastTrade, latestTradeId, chartRules }: Props) {
  const pnl = state.balance - state.startBalance;
  const live = lastTrade !== undefined && lastTrade.id === latestTradeId;
  return (
    <article className={`card venue accent-${venue.accent} ${live ? 'live' : ''}`} aria-label={`${venue.name} venue`}>
      {state.lastTradeId !== null && <span key={state.lastTradeId} className="flash" aria-hidden="true" />}
      <header className="venue-head">
        <span className="venue-icon" aria-hidden="true">{venue.icon}</span>
        <div className="venue-title">
          <span className="venue-name">{venue.name}</span>
          <span className="mono tiny muted">⌁ {venue.tagline}</span>
        </div>
        <div className="venue-money">
          <span className="venue-balance mono">{usd(state.balance)}</span>
          <span className="mono tiny"><span className={tone(pnl)}>{signedUsdShort(pnl)}</span><span className="muted"> · {state.trades} tr{state.passed ? ` · ${state.passed} passed` : ''}</span></span>
        </div>
      </header>

      <ul className="agents">
        {state.agents.map((a, i) => {
          const t = agentLastTrade[i];
          const active = t !== undefined && t.id === state.lastTradeId;
          const winRate = a.trades ? a.wins / a.trades : 0;
          return (
            <li key={a.name} className={`agent ${active ? 'active' : ''}`} style={{ ['--agent' as string]: venue.agents[i].color }}>
              {active && <span key={t.id} className="agent-flash" aria-hidden="true" />}
              <div className="agent-top">
                <span className="agent-name"><i className="agent-dot" />{a.name}</span>
                <span className="mono tiny muted" title="Share of this agent's trades that made money">
                  {a.trades ? `${Math.round(winRate * 100)}%` : '—'}
                </span>
              </div>
              <span className="agent-tech mono tiny" title={STRATEGIES[a.strategy].entryRule}>
                {chartRules ? STRATEGIES[a.strategy].label : 'no chart'}
              </span>
              <span className="agent-act mono tiny muted">
                {t ? `${REASON_VERB[t.reason]} $${t.ticker}` : a.passed ? `passed ${a.passed}×` : 'waiting'}
              </span>
              <span className="agent-bar"><span style={{ width: `${winRate * 100}%` }} /></span>
            </li>
          );
        })}
      </ul>

      <footer className="venue-foot mono tiny">
        {lastTrade ? (
          <span className="last-trade">
            <Coin ticker={lastTrade.ticker} />${lastTrade.ticker}{' '}
            <span className={tone(lastTrade.pnl)}>{signedUsd(lastTrade.pnl)}</span>
            <span className="muted"> · {simClock(lastTrade.simTimeMs)}</span>
          </span>
        ) : (
          <span className="muted">no trades yet</span>
        )}
        <span className="muted">{state.skipped > 0 ? `${state.skipped} skipped · too small` : 'paper · random prices'}</span>
      </footer>
    </article>
  );
}
