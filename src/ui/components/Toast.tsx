import type { Trade, VenueConfig } from '../../engine';
import { signedUsd, tone } from '../format';
import { Coin } from './Coin';

const VERB: Record<Trade['reason'], string> = { 'take-profit': 'took profit on', 'stop-loss': 'stopped out of', rug: 'got rugged on', signal: 'sold on signal', time: 'closed' };

export function Toast({ trade, venue }: { trade: Trade; venue: VenueConfig }) {
  return (
    <div className={`toast accent-${venue.accent}`} role="status" key={trade.id}>
      <span className="venue-icon" aria-hidden="true">{venue.icon}</span>
      <div className="toast-body">
        <strong>
          {venue.name} · {VERB[trade.reason]} ${trade.ticker} <span className={tone(trade.pnl)}>{signedUsd(trade.pnl)}</span>
        </strong>
        <span className="muted tiny">{trade.agent.toUpperCase()} · exit at bar {trade.exitStep} of {trade.windowBars} · <span className="sim-text">simulated</span></span>
      </div>
      <Coin ticker={trade.ticker} />
    </div>
  );
}
